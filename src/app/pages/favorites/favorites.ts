import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Product } from '../../models';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { ProductCard } from '../../components/product-card/product-card';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [CommonModule, ProductCard, RouterLink],
  templateUrl: './favorites.html',
})
export class Favorites implements OnInit {
  products: Product[] = [];
  loading = true;

  constructor(private apiService: ApiService, private authService: AuthService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.apiService.getMyFavorites().subscribe({
      next: (products) => {
        this.products = products;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error fetching favorites', err);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }
}
