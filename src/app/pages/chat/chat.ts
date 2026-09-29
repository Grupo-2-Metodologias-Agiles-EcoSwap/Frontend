import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api';
import { Chat, Message, User, Product } from '../../models';
import { forkJoin, map, Observable } from 'rxjs';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
})
export class ChatComponent implements OnInit, OnDestroy {
  chats: Chat[] = [];
  activeChat: Chat | null = null;
  messages: Message[] = [];
  currentUser: User | null = null;
  newMessageText = '';
  chatModerationWarning: string | null = null;
  isSendingMessage: boolean = false;
  
  // Meetup modal state
  showMeetupModal = false;
  meetupLocationId = '';
  meetupNotes = '';
  locations: any[] = [];
  meetupDate = '';
  meetupTime = '';

  // Report modal state
  showReportModal = false;
  reportReason = '';
  isSubmittingReport = false;
  reportSuccess = false;
  reportedTargetUser: User | null = null;
  reportedMessageContent: string = '';

  // Store flagged message ids and reasons (detected by AI or reported)
  flaggedMessages = new Map<string | number, { reason: string; category: string | null }>();

  // Track reports already sent to prevent duplicate reports
  reportedMessageIds = new Set<string | number>();
  reportedUsers = new Set<string | number>();

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  // Maps to store extra info for UI
  chatDetails = new Map<string, { otherUser: User, product: Product }>();

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private apiService: ApiService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.currentUser = this.authService.currentUser;
    if (!this.currentUser) return;

    this.apiService.getLocations().subscribe(locations => {
      this.locations = locations || [];
      if (this.locations.length > 0) {
        this.meetupLocationId = String(this.locations[0].id);
      }
    });

    this.chatService.initForUser(this.currentUser.id);

    this.chatService.chats$.subscribe(chats => {
      console.log('chat.ts received chats:', chats);
      this.chats = chats;
      this.loadChatDetails(chats);
      
      // Auto-select chat if passed in route query params
      const chatIdParam = this.route.snapshot.queryParamMap.get('chatId');
      if (chatIdParam) {
        const chat = chats.find(c => String(c.id) === String(chatIdParam));
        if (chat) this.selectChat(chat);
      } else if (chats.length > 0 && !this.activeChat) {
        this.selectChat(chats[0]);
      }
      console.log('chat.ts activeChat after select:', this.activeChat);
      this.cdr.detectChanges();
    });

    this.chatService.messages$.subscribe(messages => {
      this.messages = messages;
      
      // Moderación preventiva / detección IA de mensajes recibidos:
      // Analizamos los mensajes que NO son del usuario actual para alertar si contienen lenguaje inapropiado
      this.checkIncomingMessagesForModeration(messages);

      // Sincronización en tiempo real del estado vendido del producto:
      // Al recibir cualquier actualización de mensajes (incluyendo el mensaje del sistema de venta),
      // refrescamos la información del producto para inhabilitar el chat inmediatamente.
      if (this.activeChat) {
        this.apiService.getProductById(this.activeChat.productId).subscribe(product => {
          const details = this.chatDetails.get(String(this.activeChat!.id));
          if (details) {
            details.product = product;
            this.chatDetails.set(String(this.activeChat!.id), details);
            this.cdr.detectChanges();
          }
        });
      }

      this.cdr.detectChanges();
      this.scrollToBottom();
    });
  }

  scrollToBottom(): void {
    setTimeout(() => {
      try {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      } catch(err) { }
    }, 50); // slight delay to allow DOM render
  }

  loadChatDetails(chats: Chat[]) {
    if (!this.currentUser) return;
    
    const currentUserId = String(this.currentUser.id);
    
    chats.forEach(chat => {
      if (!this.chatDetails.has(String(chat.id))) {
        const otherUserId = chat.participants.find(id => String(id) !== currentUserId);
        if (otherUserId) {
          forkJoin({
            user: this.apiService.getUserById(otherUserId),
            product: this.apiService.getProductById(chat.productId)
          }).subscribe(({ user, product }) => {
            this.chatDetails.set(String(chat.id), {
              otherUser: user,
              product: product
            });
            this.cdr.detectChanges();
          });
        }
      }
    });
  }

  selectChat(chat: Chat) {
    this.activeChat = chat;
    this.chatService.setActiveChat(chat.id);
  }

  sendMessage() {
    if (!this.newMessageText.trim() || !this.activeChat || !this.currentUser) return;
    if (this.isProductSold(this.activeChat)) return;

    const text = this.newMessageText.trim();
    this.newMessageText = ''; // Limpieza instantánea para feedback inmediato
    this.chatModerationWarning = null;

    // Enviar directamente sin bloquear la UI del usuario
    this.chatService.sendMessage(this.activeChat.id, this.currentUser.id, text).subscribe({
      next: () => {
        this.sendNotificationAfterMessage();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error enviando mensaje:', err);
      }
    });
  }

  private sendNotificationAfterMessage() {
    if (!this.currentUser || !this.activeChat) return;
    const currentUserId = String(this.currentUser.id);
    const otherUserId = this.activeChat.participants.find(id => String(id) !== currentUserId);
    if (otherUserId) {
      this.apiService.getNotifications(otherUserId).subscribe(notifs => {
        const hasUnread = notifs.some(n => n.type === 'message' && String(n.chatId) === String(this.activeChat!.id) && !n.read);
        if (!hasUnread) {
          const productTitle = this.chatDetails.get(String(this.activeChat!.id))?.product.title || 'un producto';
          this.apiService.createNotification({
            userId: otherUserId,
            type: 'message',
            chatId: this.activeChat!.id,
            text: `${this.currentUser!.name} te ha enviado un mensaje sobre ${productTitle}`,
            read: false,
            createdAt: new Date().toISOString()
          }).subscribe();
        }
      });
    }
  }

  openMeetupModal() {
    this.showMeetupModal = true;
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.meetupDate = tomorrow.toISOString().split('T')[0];
    this.meetupTime = '12:00';
    this.meetupNotes = '';
    if (this.locations.length > 0) {
      this.meetupLocationId = String(this.locations[0].id);
    }
  }

  closeMeetupModal() {
    this.showMeetupModal = false;
  }

  sendMeetupProposal() {
    if (!this.activeChat || !this.currentUser || !this.meetupLocationId || !this.meetupDate || !this.meetupTime) return;
    
    const selectedLoc = this.locations.find(l => String(l.id) === String(this.meetupLocationId));
    const locationName = selectedLoc ? selectedLoc.name : 'Ubicación seleccionada';

    const meetupData = {
      locationId: this.meetupLocationId,
      location: locationName,
      date: this.meetupDate,
      time: this.meetupTime,
      notes: this.meetupNotes || '',
      status: 'pending'
    };
    
    let text = `Propuesta de encuentro: ${locationName} el ${this.meetupDate} a las ${this.meetupTime}`;
    if (this.meetupNotes) {
      text += `\nNota: ${this.meetupNotes}`;
    }
    
    this.chatService.sendMessage(this.activeChat.id, this.currentUser.id, text, 'meetup', meetupData)
      .subscribe(() => {
        this.closeMeetupModal();
      });
  }

  respondToMeetup(msg: Message, status: 'accepted' | 'declined') {
    if (!msg.id || !msg.meetup || !this.activeChat || !this.currentUser) return;
    
    const updatedMeetup = { ...msg.meetup, status };
    const patchPayload: Partial<Message> = {
      type: 'meetup',
      text: msg.text,
      meetup: updatedMeetup
    };

    this.chatService.updateMessage(msg.id, patchPayload).subscribe(() => {
      if (status === 'accepted') {
        const meetingData = {
          chatId: String(this.activeChat!.id),
          locationId: msg.meetup!.locationId ? String(msg.meetup!.locationId) : null,
          date: msg.meetup!.date,
          time: msg.meetup!.time,
          notes: msg.meetup!.notes || msg.meetup!.location || ''
        };

        this.apiService.createMeeting(meetingData).subscribe({
          next: (createdMeeting) => {
            console.log('Reunión creada exitosamente:', createdMeeting);
            // Confirmar inmediatamente para habilitar reputación
            this.apiService.confirmMeeting(createdMeeting.id).subscribe({
              next: () => {
                console.log('Reunión confirmada exitosamente');
              },
              error: (err) => {
                console.error('Error al confirmar reunión:', err);
              }
            });
          },
          error: (err) => {
            console.error('Error al crear reunión:', err);
          }
        });
      }
    });
  }

  getOtherUser(chat: Chat): User | null {
    return this.chatDetails.get(String(chat.id))?.otherUser || null;
  }

  getProductTitle(chat: Chat): string {
    return this.chatDetails.get(String(chat.id))?.product.title || 'Loading...';
  }
  
  isProductOwner(chat: Chat): boolean {
    if (!this.currentUser) return false;
    const product = this.chatDetails.get(String(chat.id))?.product;
    return String(product?.userId) === String(this.currentUser.id);
  }

  isProductSold(chat: Chat): boolean {
    const product = this.chatDetails.get(String(chat.id))?.product;
    return product?.status === 'sold';
  }

  markAsSold() {
    if (!this.activeChat) return;
    const product = this.chatDetails.get(String(this.activeChat.id))?.product;
    if (!product) return;
    
    if (confirm(`¿Seguro que quieres marcar "${product.title}" como vendido? Esto cerrará el chat.`)) {
      this.apiService.updateProduct(product.id, { status: 'sold', available: false }).subscribe(updatedProduct => {
        const details = this.chatDetails.get(String(this.activeChat!.id));
        if (details) {
          details.product = updatedProduct;
          this.chatDetails.set(String(this.activeChat!.id), details);
          this.cdr.detectChanges();
        }
        // Enviamos un mensaje de sistema para propagar el cierre del chat en tiempo real al otro usuario
        this.chatService.sendMessage(this.activeChat!.id, this.currentUser!.id, '¡Trato hecho! El producto ha sido marcado como vendido.', 'system').subscribe();
      });
    }
  }

  deleteActiveChat() {
    if (!this.activeChat) return;
    if (confirm('⚠️ ¿Seguro que quieres eliminar este chat?\n\nEsta acción eliminará de forma permanente todo el historial de mensajes y los acuerdos de reunión asociados para ambos participantes.\n\nEsta acción no se puede deshacer.')) {
      this.apiService.deleteChat(this.activeChat.id).subscribe(() => {
        this.activeChat = null;
        this.chatService.refreshChats();
        this.cdr.detectChanges();
      });
    }
  }

  private checkedMessageIds = new Set<string | number>();

  checkIncomingMessagesForModeration(messages: Message[]) {
    if (!this.currentUser) return;
    const currentUserId = String(this.currentUser.id);

    messages.forEach(msg => {
      // Solo analizamos mensajes que no sean propios, sean de texto y no hayan sido analizados previamente
      if (msg.id && String(msg.senderId) !== currentUserId && msg.type === 'text' && msg.text && !this.checkedMessageIds.has(msg.id)) {
        this.checkedMessageIds.add(msg.id);

        this.apiService.moderateMessage(msg.text).subscribe({
          next: (res) => {
            if (!res.allowed) {
              this.flaggedMessages.set(msg.id!, {
                reason: res.reason || 'Contenido posiblemente inapropiado',
                category: res.category || 'Moderación IA'
              });
              this.cdr.detectChanges();
            }
          },
          error: (err) => {
            console.warn('Error al verificar mensaje con IA:', err);
          }
        });
      }
    });
  }

  isMessageFlagged(msg: Message): boolean {
    return !!(msg.id && this.flaggedMessages.has(msg.id));
  }

  getFlaggedDetails(msg: Message): { reason: string; category: string | null } | undefined {
    return msg.id ? this.flaggedMessages.get(msg.id) : undefined;
  }

  private reportedMessageIdBeingProcessed: string | number | null = null;

  isMessageReported(msg: Message): boolean {
    return !!(msg.id && this.reportedMessageIds.has(msg.id));
  }

  isOtherUserReported(): boolean {
    if (!this.activeChat) return false;
    const otherUser = this.getOtherUser(this.activeChat);
    return !!(otherUser && this.reportedUsers.has(otherUser.id));
  }

  openReportModal(targetUser: User | null, msg?: Message) {
    if (!targetUser) return;
    if (msg && msg.id && this.reportedMessageIds.has(msg.id)) {
      alert('Ya has enviado un reporte sobre este mensaje.');
      return;
    }
    if (!msg && this.reportedUsers.has(targetUser.id)) {
      alert('Ya has enviado un reporte sobre este usuario.');
      return;
    }

    this.reportedTargetUser = targetUser;
    this.reportedMessageContent = msg ? msg.text : '';
    this.reportedMessageIdBeingProcessed = msg?.id || null;
    
    // Si viene de un mensaje flaggeado por la IA, prellenar la justificación
    if (msg && msg.id && this.flaggedMessages.has(msg.id)) {
      const flagged = this.flaggedMessages.get(msg.id)!;
      this.reportReason = `Reporte por infracción detectada por IA (${flagged.category || 'Normas'}): "${msg.text}". Motivo: ${flagged.reason}`;
    } else if (msg) {
      this.reportReason = `Mensaje inapropiado: "${msg.text}"`;
    } else {
      this.reportReason = '';
    }

    this.showReportModal = true;
    this.reportSuccess = false;
    this.isSubmittingReport = false;
  }

  closeReportModal() {
    this.showReportModal = false;
    this.reportedTargetUser = null;
    this.reportedMessageContent = '';
    this.reportedMessageIdBeingProcessed = null;
    this.reportReason = '';
    this.reportSuccess = false;
  }

  submitReport() {
    if (!this.reportedTargetUser || !this.reportReason.trim() || !this.currentUser) return;

    this.isSubmittingReport = true;
    const currentProductId = this.activeChat?.productId;
    const currentTargetId = this.reportedTargetUser.id;
    const currentMsgId = this.reportedMessageIdBeingProcessed;

    this.apiService.createReport({
      reportedUserId: currentTargetId,
      productId: currentProductId ? currentProductId : undefined,
      reason: this.reportReason.trim()
    }).subscribe({
      next: () => {
        this.isSubmittingReport = false;
        this.reportSuccess = true;

        // Registrar para no permitir volver a enviar el mismo reporte
        if (currentMsgId) {
          this.reportedMessageIds.add(currentMsgId);
        } else {
          this.reportedUsers.add(currentTargetId);
        }

        this.cdr.detectChanges();
        setTimeout(() => {
          this.closeReportModal();
          this.cdr.detectChanges();
        }, 1800);
      },
      error: (err) => {
        this.isSubmittingReport = false;
        console.error('Error al enviar reporte:', err);
        alert(err.error?.error || 'Hubo un error al enviar el reporte.');
        this.cdr.detectChanges();
      }
    });
  }

  isMyMessage(msg: Message): boolean {
    return String(msg.senderId) === String(this.currentUser?.id);
  }

  ngOnDestroy() {
    this.chatService.stopPolling();
  }
}
