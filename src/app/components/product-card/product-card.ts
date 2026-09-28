import { Component, Input, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Product } from '../../models';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ApiService } from '../../services/api';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './product-card.html',
})
export class ProductCard implements OnInit {
  private _product!: Product;

  @Input()
  set product(val: Product) {
    this._product = val;
    this.updateProductDetails();
  }
  get product(): Product {
    return this._product;
  }

  isMyProduct = false;
  isFavorite = false;

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ownerReputation = 5;
  ownerReviewCount = 0;

  ngOnInit() {
    this.updateProductDetails();
  }

  private updateProductDetails() {
    const user = this.authService.currentUser;
    if (user && this._product) {
      this.isMyProduct = String(this._product.userId) === String(user.id);
      this.isFavorite = (user.favorites || []).map(String).includes(String(this._product.id));
    }

    if (this._product && this._product.userId) {
      this.apiService.getUserById(this._product.userId).subscribe({
        next: (owner) => {
          if (owner) {
            this.ownerReputation = owner.reputation !== undefined ? owner.reputation : 5;
            this.cdr.detectChanges();
          }
        },
        error: (err) => console.error('[ProductCard] Error fetching owner:', err)
      });

      this.apiService.getReviews(this._product.userId).subscribe({
        next: (reviews) => {
          if (reviews) {
            this.ownerReviewCount = reviews.length;
            this.cdr.detectChanges();
          }
        },
        error: (err) => console.error('[ProductCard] Error fetching reviews:', err)
      });
    }
  }

  toggleFavorite(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    const user = this.authService.currentUser;
    if (!user) return;

    this.isFavorite = !this.isFavorite; // Optimistic UI update
    
    this.apiService.toggleFavorite(user.id, this.product.id, user.favorites || []).subscribe(updatedUser => {
      this.authService.updateCurrentUser(updatedUser);
    });
  }

  getStars(reputation: number): number[] {
    return Array(Math.round(reputation) || 0).fill(0);
  }

  getEmptyStars(reputation: number): number[] {
    return Array(5 - (Math.round(reputation) || 0)).fill(0);
  }
}
