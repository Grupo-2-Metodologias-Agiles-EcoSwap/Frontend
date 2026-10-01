import { Component, OnInit, HostListener, ViewChild, ElementRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth';
import { NotificationService } from '../../services/notification.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './navbar.html',
})
export class Navbar implements OnInit {
  unreadCount$;
  notifications$;
  isNotificationsOpen = false;
  isProfileMenuOpen = false;

  constructor(
    public authService: AuthService,
    private notificationService: NotificationService,
    private router: Router
  ) {
    this.unreadCount$ = this.notificationService.unreadCount$;
    this.notifications$ = this.notificationService.notifications$;
  }

  ngOnInit() {
    // Polling de notificaciones desactivado para la entrega del Trabajo Parcial (Disponible en Trabajo Final)
  }

  @ViewChild('notificationsDropdown') notificationsDropdown!: ElementRef;

  logout() {
    this.authService.logout();
    this.isProfileMenuOpen = false;
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  clickout(event: Event) {
    if (this.isNotificationsOpen && this.notificationsDropdown && !this.notificationsDropdown.nativeElement.contains(event.target)) {
      this.isNotificationsOpen = false;
    }
    this.isProfileMenuOpen = false;
  }

  toggleNotifications(event?: Event) {
    if (event) event.stopPropagation();
    this.isNotificationsOpen = !this.isNotificationsOpen;
    if (this.isNotificationsOpen) {
      this.isProfileMenuOpen = false;
    }
  }

  toggleProfileMenu(event: Event) {
    event.stopPropagation();
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
    if (this.isProfileMenuOpen) {
      this.isNotificationsOpen = false;
    }
  }

  markAsRead(notification: any, event: Event) {
    event.stopPropagation();
    if (!notification.read) {
      this.notificationService.markAsRead(notification.id).subscribe();
    }
  }

  deleteNotification(id: number | string, event: Event) {
    event.stopPropagation();
    this.notificationService.deleteNotification(id).subscribe();
  }

  goToChat(chatId: number | string) {
    this.isNotificationsOpen = false;
    this.router.navigate(['/chat'], { queryParams: { chatId } }); // Changed 'chat' to 'chatId' for consistency with chat component
  }
}
