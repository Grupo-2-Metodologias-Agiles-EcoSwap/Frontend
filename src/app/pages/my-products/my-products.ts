import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { Product } from '../../models';
import { ProductCard } from '../../components/product-card/product-card';

@Component({
  selector: 'app-my-products',
  standalone: true,
  imports: [CommonModule, ProductCard],
  templateUrl: './my-products.html',
})
export class MyProducts implements OnInit {
  products: Product[] = [];
  activeTab: 'sale' | 'wanted' = 'sale';

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.apiService.getProductsByUserId(user.id).subscribe(data => {
          // The API already filters by userId, so we just assign the data
          this.products = data;
          this.cdr.detectChanges();
        });
      } else {
        this.products = [];
        this.cdr.detectChanges();
      }
    });
  }

  setActiveTab(tab: 'sale' | 'wanted') {
    this.activeTab = tab;
  }

  get filteredProducts(): Product[] {
    return this.products.filter(p => {
      if (this.activeTab === 'wanted') {
        return p.type === 'wanted';
      }
      return p.type !== 'wanted';
    });
  }
}
