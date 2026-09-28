import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription, interval, map } from 'rxjs';
import { ApiService } from './api';
import { SupabaseService } from './supabase.service';
import { Chat, Message } from '../models';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class ChatService implements OnDestroy {
  private chatsSubject = new BehaviorSubject<Chat[]>([]);
  public chats$ = this.chatsSubject.asObservable();

  private messagesSubject = new BehaviorSubject<Message[]>([]);
  public messages$ = this.messagesSubject.asObservable();

  private activeChatIdSubject = new BehaviorSubject<number | string | null>(null);
  public activeChatId$ = this.activeChatIdSubject.asObservable();

  private pollSubscription?: Subscription;
  private userId: number | string | null = null;
  private messageChannel?: RealtimeChannel;

  constructor(
    private apiService: ApiService,
    private supabaseService: SupabaseService
  ) { }

  initForUser(userId: number | string) {
    this.userId = userId;
    this.refreshChats();
    this.startPolling();
  }

  private startPolling() {
    this.stopPolling();
    // Poll only for new or updated chats list
    this.pollSubscription = interval(3000).subscribe(() => {
      if (this.userId) {
        this.apiService.getChats(this.userId).subscribe(chats => {
          chats.sort((a, b) => {
            const timeA = new Date(a.updatedAt || a.createdAt).getTime();
            const timeB = new Date(b.updatedAt || b.createdAt).getTime();
            return timeB - timeA;
          });
          if (JSON.stringify(chats) !== JSON.stringify(this.chatsSubject.value)) {
            this.chatsSubject.next(chats);
          }
        });
      }
    });
  }

  stopPolling() {
    if (this.pollSubscription) {
      this.pollSubscription.unsubscribe();
      this.pollSubscription = undefined;
    }
    this.unsubscribeFromMessages();
  }

  private unsubscribeFromMessages() {
    if (this.messageChannel) {
      this.supabaseService.client.removeChannel(this.messageChannel);
      this.messageChannel = undefined;
    }
  }

  private subscribeToMessages(chatId: number | string) {
    this.unsubscribeFromMessages();

    this.messageChannel = this.supabaseService.client
      .channel(`room:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE (for meetup updates) and DELETE
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        (payload) => {
          const eventType = payload.eventType;
          const currentMessages = this.messagesSubject.value;

          if (eventType === 'INSERT') {
            const newMsg = payload.new;
            let text = newMsg['content'];
            let type: 'text' | 'meetup' | 'system' = 'text';
            let meetup = undefined;
            try {
              if (text && text.startsWith('{')) {
                const parsed = JSON.parse(text);
                if (parsed.type) {
                  type = parsed.type;
                  text = parsed.text || '';
                  meetup = parsed.meetup;
                }
              }
            } catch (e) { }

            const mappedMessage: Message = {
              id: newMsg['id'],
              chatId: newMsg['chat_id'],
              senderId: newMsg['sender_id'],
              text: text,
              createdAt: newMsg['created_at'],
              type: type,
              meetup: meetup
            };

            if (!currentMessages.some(m => m.id === mappedMessage.id)) {
              this.messagesSubject.next([...currentMessages, mappedMessage]);
            }
          } else if (eventType === 'UPDATE') {
            const updatedMsg = payload.new;
            let text = updatedMsg['content'];
            let type: 'text' | 'meetup' | 'system' = 'text';
            let meetup = undefined;
            try {
              if (text && text.startsWith('{')) {
                const parsed = JSON.parse(text);
                if (parsed.type) {
                  type = parsed.type;
                  text = parsed.text || '';
                  meetup = parsed.meetup;
                }
              }
            } catch (e) { }

            const index = currentMessages.findIndex(m => m.id === updatedMsg['id']);
            if (index !== -1) {
              const updatedList = [...currentMessages];
              updatedList[index] = {
                ...updatedList[index],
                text: text,
                type: type,
                meetup: meetup
              };
              this.messagesSubject.next(updatedList);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime Chat] Subscription status for room:${chatId}:`, status);
      });
  }

  setActiveChat(chatId: number | string) {
    this.activeChatIdSubject.next(chatId);
    this.apiService.getMessages(chatId).subscribe(messages => {
      this.messagesSubject.next(messages);
      this.subscribeToMessages(chatId);
    });
  }

  refreshChats() {
    if (this.userId) {
      console.log('refreshChats called with userId:', this.userId);
      this.apiService.getChats(this.userId).subscribe(chats => {
        chats.sort((a, b) => {
          const timeA = new Date(a.updatedAt || a.createdAt).getTime();
          const timeB = new Date(b.updatedAt || b.createdAt).getTime();
          return timeB - timeA;
        });
        console.log('getChats returned:', chats);
        this.chatsSubject.next(chats);
      });
    }
  }

  sendMessage(chatId: number | string, senderId: number | string, text: string, type: 'text' | 'meetup' | 'system' = 'text', meetup?: any) {
    const newMessage: any = { chatId, senderId, text, type, createdAt: new Date().toISOString() };
    if (meetup) {
      newMessage.meetup = meetup;
    }

    return this.apiService.sendMessage(newMessage).pipe(
      map(savedMessage => {
        const currentMessages = this.messagesSubject.value;
        if (!currentMessages.some(m => m.id === savedMessage.id)) {
          this.messagesSubject.next([...currentMessages, savedMessage]);
        }
        return savedMessage;
      })
    );
  }

  updateMessage(messageId: number | string, data: Partial<Message>) {
    return this.apiService.updateMessage(messageId, data).pipe(
      map(updatedMessage => {
        const currentMessages = this.messagesSubject.value;
        const index = currentMessages.findIndex(m => m.id === messageId);
        if (index !== -1) {
          currentMessages[index] = { ...currentMessages[index], ...updatedMessage };
          this.messagesSubject.next([...currentMessages]);
        }
        return updatedMessage;
      })
    );
  }

  ngOnDestroy() {
    this.stopPolling();
  }
}
