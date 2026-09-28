import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, from, catchError, of } from 'rxjs';
import { Product, Category, User, Chat, Message, Notification, Review } from '../models';
import { environment } from '../../environments/environment';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private supabaseService: SupabaseService
  ) {}

  private mapProduct(p: any): Product {
    return {
      id: p.id,
      title: p.title,
      description: p.description || '',
      price: p.price,
      status: p.status || 'used',
      categoryId: p.category_id,
      userId: p.user_id,
      available: p.available === true || String(p.available) === 'true',
      type: p.type || 'sale',
      createdAt: p.created_at || new Date().toISOString(),
      images: Array.isArray(p.image_url) ? p.image_url : (p.image_url ? [p.image_url] : []),
      model3d: p.model_3d,
      subject: p.subject
    };
  }

  private mapMeetingToChat(m: any): Chat {
    const chat = m.chats || {};
    return {
      id: m.id,
      productId: m.product_id || chat.product_id,
      participants: [m.creator_id || chat.seller_id, m.interested_id || chat.buyer_id],
      createdAt: m.created_at || m.meeting_date || new Date().toISOString(),
      updatedAt: m.updated_at || m.created_at || new Date().toISOString()
    };
  }

  private mapChat(c: any): Chat {
    return {
      id: c.id,
      productId: c.product_id,
      participants: [c.seller_id, c.buyer_id],
      createdAt: c.created_at || new Date().toISOString(),
      updatedAt: c.created_at || new Date().toISOString()
    };
  }

  getProducts(): Observable<Product[]> {
    return this.http.get<any[]>(`${this.apiUrl}/products`).pipe(
      map(products => (products || []).map(p => this.mapProduct(p)))
    );
  }

  getProductsByUserId(userId: number | string): Observable<Product[]> {
    return this.http.get<any[]>(`${this.apiUrl}/products?userId=${userId}`).pipe(
      map(products => (products || []).map(p => this.mapProduct(p)))
    );
  }

  getProductsExceptUserId(userId: number | string): Observable<Product[]> {
    return this.http.get<any[]>(`${this.apiUrl}/products?excludeUserId=${userId}`).pipe(
      map(products => (products || []).map(p => this.mapProduct(p)))
    );
  }

  getProductById(id: number | string): Observable<Product> {
    return this.http.get<any>(`${this.apiUrl}/products/${id}`).pipe(
      map(p => this.mapProduct(p))
    );
  }

  addProduct(product: Partial<Product>): Observable<Product> {
    const backendProduct = {
      title: product.title,
      price: product.price,
      category: product.categoryId,
      imagesBase64: product.images || [],
      status: product.status || 'used',
      model3d: product.model3d,
      type: product.type || 'sale',
      description: product.description,
      subject: product.subject
    };
    return this.http.post<any>(`${this.apiUrl}/products`, backendProduct).pipe(
      map(res => {
        const p = Array.isArray(res) ? res[0] : res;
        return this.mapProduct(p);
      })
    );
  }

  updateProduct(id: number | string, product: Partial<Product>): Observable<Product> {
    const backendProduct = {
      title: product.title,
      price: product.price,
      status: product.status,
      available: product.available,
      model3d: product.model3d,
      description: product.description,
      subject: product.subject,
      imagesBase64: product.images,
      category: product.categoryId,
      type: product.type
    };
    return this.http.put<any>(`${this.apiUrl}/products/${id}`, backendProduct).pipe(
      map(res => {
        const p = Array.isArray(res) ? res[0] : res;
        return this.mapProduct(p);
      })
    );
  }

  deleteProduct(id: number | string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/products/${id}`);
  }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.apiUrl}/categories`);
  }

  getLocations(): Observable<any[]> {
    return from(this.supabaseService.client.from('locations').select('*')).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data || [];
      })
    );
  }

  getUsers(): Observable<User[]> {
    return from(this.supabaseService.client.from('users').select('*')).pipe(
      map(response => {
        if (response.error) throw response.error;
        return (response.data || []).map((u: any) => ({
          ...u,
          avatar: u.image_url,
          createdAt: u.created_at
        }));
      })
    );
  }

  getUserById(id: number | string): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/${id}`).pipe(
      catchError(() => of({
        id,
        name: 'Estudiante EcoSwap',
        email: '',
        career: 'General',
        cycle: 1,
        reputation: 5,
        verified: false,
        active: true,
        createdAt: new Date().toISOString()
      } as User))
    );
  }

  updateUser(id: number | string, user: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/users/profile`, user);
  }

  toggleFavorite(userId: number | string, productId: number | string, currentFavorites: (number | string)[] = []): Observable<User> {
    const strProductId = String(productId);
    const isFavorited = currentFavorites.map(String).includes(strProductId);
    
    const request = isFavorited
      ? this.http.delete<any>(`${this.apiUrl}/favorites/${productId}`)
      : this.http.post<any>(`${this.apiUrl}/favorites`, { productId });

    return request.pipe(
      map(() => {
        const newFavorites = isFavorited 
          ? currentFavorites.filter(id => String(id) !== strProductId) 
          : [...currentFavorites, productId];
        
        const savedUser = localStorage.getItem('currentUser');
        const user = savedUser ? JSON.parse(savedUser) : { id: userId };
        user.favorites = newFavorites;
        return user as User;
      })
    );
  }

  getMyFavorites(): Observable<Product[]> {
    return this.http.get<any[]>(`${this.apiUrl}/favorites`).pipe(
      map(products => (products || []).map(p => this.mapProduct(p)))
    );
  }

  getChats(userId: number | string): Observable<Chat[]> {
    return this.http.get<any[]>(`${this.apiUrl}/chats/my-chats`).pipe(
      map(chats => (chats || []).map(c => this.mapChat(c)))
    );
  }

  createChat(chat: Partial<Chat>): Observable<Chat> {
    const savedUser = localStorage.getItem('currentUser');
    const currentUserId = savedUser ? JSON.parse(savedUser).id : null;
    const sellerId = chat.participants?.find(p => String(p) !== String(currentUserId));
    const backendChat = {
      productId: chat.productId,
      sellerId: sellerId || chat.participants?.[1] || ''
    };
    return this.http.post<any>(`${this.apiUrl}/chats`, backendChat).pipe(
      map(res => this.mapChat(res))
    );
  }

  updateChat(id: number | string, chat: Partial<Chat>): Observable<Chat> {
    // If confirming the meeting
    return this.http.post<any>(`${this.apiUrl}/meetings/${id}/confirm`, {}).pipe(
      map(res => this.mapMeetingToChat(res))
    );
  }

  deleteChat(id: number | string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/chats/${id}`);
  }

  getMyMeetings(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/meetings/my-meetings`);
  }

  createMeeting(meeting: { chatId: string; locationId: string | null; date: string; time: string; notes?: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/meetings`, meeting);
  }

  confirmMeeting(id: number | string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/meetings/${id}/confirm`, {});
  }

  cancelMeeting(id: number | string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/meetings/${id}/cancel`, {});
  }

  getMessages(chatId: number | string): Observable<Message[]> {
    return this.http.get<any[]>(`${this.apiUrl}/chats/${chatId}/messages`).pipe(
      map(msgs => (msgs || []).map(m => {
        let text = m.content;
        let type: 'text' | 'meetup' | 'system' = 'text';
        let meetup = undefined;
        try {
          if (m.content && m.content.startsWith('{')) {
            const parsed = JSON.parse(m.content);
            if (parsed.type) {
              type = parsed.type;
              text = parsed.text || '';
              meetup = parsed.meetup;
            }
          }
        } catch (e) {}
        return {
          id: m.id,
          chatId: m.chat_id,
          senderId: m.sender_id,
          text: text,
          type: type,
          meetup: meetup,
          createdAt: m.created_at || new Date().toISOString()
        };
      }))
    );
  }

  sendMessage(message: Partial<Message>): Observable<Message> {
    let content = message.text || '';
    if (message.type === 'meetup') {
      content = JSON.stringify({
        type: 'meetup',
        text: message.text,
        meetup: message.meetup
      });
    } else if (message.type === 'system') {
      content = JSON.stringify({
        type: 'system',
        text: message.text
      });
    }
    return this.http.post<any>(`${this.apiUrl}/chats/${message.chatId}/messages`, {
      content: content
    }).pipe(
      map(m => {
        let text = m.content;
        let type: 'text' | 'meetup' | 'system' = 'text';
        let meetup = undefined;
        try {
          if (m.content && m.content.startsWith('{')) {
            const parsed = JSON.parse(m.content);
            if (parsed.type) {
              type = parsed.type;
              text = parsed.text || '';
              meetup = parsed.meetup;
            }
          }
        } catch (e) {}
        return {
          id: m.id,
          chatId: m.chat_id,
          senderId: m.sender_id,
          text: text,
          type: type,
          meetup: meetup,
          createdAt: m.created_at || new Date().toISOString()
        };
      })
    );
  }

  updateMessage(id: number | string, message: Partial<Message>): Observable<Message> {
    let content = message.text || '';
    if (message.type === 'meetup' || message.meetup) {
      content = JSON.stringify({
        type: 'meetup',
        text: message.text,
        meetup: message.meetup
      });
    } else if (message.type === 'system') {
      content = JSON.stringify({
        type: 'system',
        text: message.text
      });
    }
    return this.http.patch<any>(`${this.apiUrl}/chats/messages/${id}`, {
      content: content
    }).pipe(
      map(m => {
        let text = m.content;
        let type: 'text' | 'meetup' | 'system' = 'text';
        let meetup = undefined;
        try {
          if (m.content && m.content.startsWith('{')) {
            const parsed = JSON.parse(m.content);
            if (parsed.type) {
              type = parsed.type;
              text = parsed.text || '';
              meetup = parsed.meetup;
            }
          }
        } catch (e) {}
        return {
          id: m.id,
          chatId: m.chat_id,
          senderId: m.sender_id,
          text: text,
          type: type,
          meetup: meetup,
          createdAt: m.created_at || new Date().toISOString()
        };
      })
    );
  }


  getNotifications(userId: number | string): Observable<Notification[]> {
    return this.http.get<any[]>(`${this.apiUrl}/notifications`).pipe(
      map(data => {
        return (data || []).map(n => ({
          id: n.id,
          userId: n.user_id,
          type: n.type,
          title: n.title,
          text: n.message || '',
          message: n.message || '',
          chatId: n.link_to,
          read: n.read,
          createdAt: n.created_at
        }));
      })
    );
  }

  markNotificationRead(id: number | string, read: boolean = true): Observable<Notification> {
    return this.http.patch<any>(`${this.apiUrl}/notifications/${id}/read`, { read }).pipe(
      map(n => {
        return {
          id: n.id,
          userId: n.user_id,
          type: n.type,
          title: n.title,
          text: n.message || '',
          message: n.message || '',
          chatId: n.link_to,
          read: n.read,
          createdAt: n.created_at
        };
      })
    );
  }

  createNotification(notification: Partial<Notification>): Observable<Notification> {
    return this.http.post<any>(`${this.apiUrl}/notifications`, {
      userId: notification.userId,
      type: notification.type,
      title: notification.title || 'Nueva notificación',
      message: notification.text || notification.message || '',
      link_to: notification.chatId ? String(notification.chatId) : null
    }).pipe(
      map(n => {
        return {
          id: n.id,
          userId: n.user_id,
          type: n.type,
          title: n.title,
          text: n.message || '',
          message: n.message || '',
          chatId: n.link_to,
          read: n.read,
          createdAt: n.created_at
        };
      })
    );
  }

  deleteNotification(id: number | string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/notifications/${id}`);
  }

  getReviews(userId: number | string): Observable<Review[]> {
    return this.http.get<any[]>(`${this.apiUrl}/reputation/${userId}`).pipe(
      map(reviews => (reviews || []).map(r => ({
        id: r.id,
        reviewerId: r.reviewer_id,
        targetUserId: r.user_id,
        rating: r.points,
        comment: r.reason || '',
        createdAt: r.created_at
      })))
    );
  }

  addReview(review: Partial<Review> & { meetingId?: number | string }): Observable<any> {
    const backendReview = {
      targetUserId: review.targetUserId,
      points: review.rating || 5,
      meetingId: review.meetingId || null,
      reason: review.comment || ''
    };
    return this.http.post<any>(`${this.apiUrl}/reputation`, backendReview);
  }

  deleteReview(id: number | string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/reputation/${id}`);
  }

  createReport(report: { reportedUserId?: number | string; productId?: number | string; reason: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/reports`, report);
  }

  moderateProduct(product: { title: string; description?: string; category?: string; imagesBase64?: string[] }): Observable<{ allowed: boolean; reason: string; category: string | null }> {
    return this.http.post<{ allowed: boolean; reason: string; category: string | null }>(`${this.apiUrl}/ai/moderate-product`, product);
  }

  moderateMessage(content: string): Observable<{ allowed: boolean; reason: string; category: string | null }> {
    return this.http.post<{ allowed: boolean; reason: string; category: string | null }>(`${this.apiUrl}/ai/moderate-message`, { content });
  }
}
