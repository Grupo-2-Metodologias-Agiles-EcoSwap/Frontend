import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { Product, Category, User } from '../../models';
import { ProductCard } from '../../components/product-card/product-card';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, ProductCard, RouterLink],
  templateUrl: './home.html',
})
export class Home implements OnInit {
  products: Product[] = [];
  allProducts: Product[] = [];
  categories: Category[] = [];
  currentUser: User | null = null;
  trendingProducts: Product[] = [];
  selectedCategoryId: string | number | null = null;
  feedType: 'sale' | 'wanted' = 'sale';

  // Inline Post Form State
  postContent: string = '';
  postImageBase64: string | null = null;
  postType: 'sale' | 'wanted' = 'sale';
  postCategoryId: string | number = '';
  postPrice: number | null = null;
  postStatus: string = 'any';

  showDetails: boolean = false;
  isPublishing: boolean = false;
  moderationError: string | null = null;
  moderationCategory: string | null = null;

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;

      const request$ = user
        ? this.apiService.getProductsExceptUserId(user.id)
        : this.apiService.getProducts();

      request$.subscribe({
        next: (data) => {
          // Store all products to allow filtering
          this.allProducts = [...data].reverse();
          this.applyFilters();
          // Popular/Trending for right sidebar (mock logic, only sales)
          this.trendingProducts = [...data].filter(p => p.type !== 'wanted').sort((a, b) => b.price - a.price).slice(0, 3);
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('API Error in Home:', err);
        }
      });
    });

    this.apiService.getCategories().subscribe(cats => {
      this.categories = cats;
      this.cdr.detectChanges();
    });
  }

  setFeedType(type: 'sale' | 'wanted') {
    if (this.feedType !== type) {
      this.feedType = type;
      this.applyFilters();
    }
  }

  toggleCategory(categoryId: string | number) {
    if (this.selectedCategoryId === categoryId) {
      this.selectedCategoryId = null; // Toggle off
    } else {
      this.selectedCategoryId = categoryId; // Toggle on
    }
    this.applyFilters();
  }

  applyFilters() {
    let filtered = this.allProducts;

    // 1. Filter by Category
    if (this.selectedCategoryId !== null) {
      filtered = filtered.filter(p => p.categoryId == this.selectedCategoryId);
    }

    // 2. Filter by Feed Type (sale vs wanted)
    if (this.feedType === 'wanted') {
      filtered = filtered.filter(p => p.type === 'wanted');
    } else {
      filtered = filtered.filter(p => p.type !== 'wanted'); // default 'sale' or undefined
    }

    this.products = filtered.slice(0, 10);
    this.cdr.detectChanges();
  }

  // --- Inline Publishing Logic ---

  isFormInvalid(): boolean {
    if (this.isPublishing) return true;
    if (!this.postContent || !this.postContent.trim()) return true;
    if (!this.postCategoryId) return true;

    if (this.postType === 'sale') {
      if (!this.postImageBase64) return true;
      if (this.postPrice === null || this.postPrice === undefined || this.postPrice < 0) return true;
    }

    return false;
  }

  toggleDetails() {
    this.showDetails = !this.showDetails;
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.postImageBase64 = e.target?.result as string;
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  removeImage() {
    this.postImageBase64 = null;
  }

  publishPost() {
    if (!this.currentUser) return;
    if (!this.postContent.trim() && !this.postImageBase64) return;

    this.isPublishing = true;
    this.moderationError = null;
    this.moderationCategory = null;
    this.cdr.detectChanges();

    // Default values if some fields are left empty
    const finalType = this.postType;
    const finalPrice = finalType === 'wanted' ? 0 : (this.postPrice || 0);
    const finalCategory = this.postCategoryId || (this.categories.length > 0 ? this.categories[0].id : undefined);
    const selectedCategoryName = this.categories.find(c => c.id === finalCategory)?.name || '';

    // Create a meaningful title from content (first 50 chars)
    let finalTitle = this.postContent.trim().split('\n')[0].substring(0, 50);
    if (finalTitle.length === 50) finalTitle += '...';
    if (!finalTitle) finalTitle = finalType === 'wanted' ? 'Busco material' : 'Vendo material';

    const newPost: Partial<Product> = {
      title: finalTitle,
      description: this.postContent.trim() || finalTitle,
      price: finalPrice,
      status: this.postStatus,
      categoryId: finalCategory,
      userId: this.currentUser.id,
      available: true,
      type: finalType,
      createdAt: new Date().toISOString(),
      images: this.postImageBase64 ? [this.postImageBase64] : []
    };

    // Moderación preventiva con Gemini IA
    this.apiService.moderateProduct({
      title: finalTitle,
      description: this.postContent.trim(),
      category: selectedCategoryName,
      imagesBase64: this.postImageBase64 ? [this.postImageBase64] : []
    }).subscribe({
      next: (modResult) => {
        if (!modResult.allowed) {
          this.isPublishing = false;
          this.moderationError = modResult.reason;
          this.moderationCategory = modResult.category;
          this.cdr.detectChanges();
          return;
        }

        // Si es aprobado, procedemos a guardar
        this.apiService.addProduct(newPost).subscribe({
          next: (createdPost) => {
            // Reset form
            this.postContent = '';
            this.postImageBase64 = null;
            this.postPrice = null;
            this.showDetails = false;
            this.isPublishing = false;
            this.moderationError = null;
            this.moderationCategory = null;

            alert('Publicación creada con éxito. Puedes verla en la sección de tus productos.');
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error('Error publishing post', err);
            this.isPublishing = false;
            if (err.status === 422 && err.error?.isModerated) {
              this.moderationError = err.error.error;
              this.moderationCategory = err.error.category;
            } else {
              alert(err.error?.error || 'Error al publicar.');
            }
            this.cdr.detectChanges();
          }
        });
      },
      error: () => {
        // Fallback: si falla el servicio de IA, enviamos directamente
        this.apiService.addProduct(newPost).subscribe({
          next: () => {
            this.postContent = '';
            this.postImageBase64 = null;
            this.postPrice = null;
            this.showDetails = false;
            this.isPublishing = false;
            alert('Publicación creada con éxito.');
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.isPublishing = false;
            if (err.status === 422 && err.error?.isModerated) {
              this.moderationError = err.error.error;
              this.moderationCategory = err.error.category;
            } else {
              alert(err.error?.error || 'Error al publicar.');
            }
            this.cdr.detectChanges();
          }
        });
      }
    });
  }
}

