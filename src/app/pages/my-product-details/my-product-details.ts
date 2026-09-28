import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { Product, Category } from '../../models';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-my-product-details',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './my-product-details.html',
})
export class MyProductDetails implements OnInit {
  product: Product | null = null;
  selectedImage: string = '';
  categories: Category[] = [];

  // Edit Modal State
  showEditModal = false;
  editTitle = '';
  editPrice = 0;
  editStatus = 'used';
  editDescription = '';
  editCategoryId: string | number = '';
  editSubject = '';
  editType: 'sale' | 'wanted' = 'sale';
  editImages: string[] = [];
  isCompressing: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadProductDetails(id);
      }
    });

    this.apiService.getCategories().subscribe({
      next: (cats) => {
        this.categories = cats;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error loading categories:', err)
    });
  }

  loadProductDetails(id: string) {
    this.apiService.getProductById(id).subscribe({
      next: (data) => {
        // Verify ownership
        const user = this.authService.currentUser;
        if (!user || String(data.userId) !== String(user.id)) {
          console.warn('Access denied or not owner. Redirecting to catalog...', {
            productOwnerId: data.userId,
            currentUserId: user?.id
          });
          this.router.navigate(['/catalog']); // Redirect if not owner
          return;
        }
        this.product = data;
        if (data.images && data.images.length > 0) {
          this.selectedImage = this.formatImage(data.images[0]);
        } else {
          this.selectedImage = 'https://images.unsplash.com/photo-1544716278-e513176f20b5?auto=format&fit=crop&q=80&w=800';
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading product details:', err);
        this.router.navigate(['/catalog']); // Redirect to catalog on error
        this.cdr.detectChanges();
      }
    });
  }

  formatImage(img: string): string {
    if (!img) return '';
    return img.startsWith('data:image') || img.startsWith('http') ? img : 'assets/' + img;
  }

  deleteProduct() {
    if (!this.product) return;
    if (confirm('¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer.')) {
      this.apiService.deleteProduct(this.product.id).subscribe({
        next: () => {
          this.router.navigate(['/my-products']);
        },
        error: (err) => {
          console.error('Error deleting product:', err);
          alert('Hubo un error al eliminar el producto.');
        }
      });
    }
  }

  toggleAvailability() {
    if (!this.product) return;
    const newAvailableState = !this.product.available;
    this.apiService.updateProduct(this.product.id, { available: newAvailableState }).subscribe({
      next: (updatedProduct) => {
        this.product!.available = updatedProduct.available;
        this.cdr.detectChanges();
        alert(newAvailableState ? 'Publicación reactivada con éxito.' : 'Publicación pausada con éxito.');
      },
      error: (err) => {
        console.error('Error updating product status:', err);
        alert('Hubo un error al actualizar el estado del producto.');
      }
    });
  }

  openEditModal() {
    if (!this.product) return;
    this.editTitle = this.product.title;
    this.editPrice = this.product.price;
    this.editStatus = this.product.status;
    this.editDescription = this.product.description;
    this.editCategoryId = this.product.categoryId;
    this.editSubject = this.product.subject || '';
    this.editType = this.product.type || 'sale';
    this.editImages = [...this.product.images];
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
  }

  async onFileSelected(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.isCompressing = true;
      this.cdr.detectChanges();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.match(/image\/*/)) {
          try {
            const compressed = await this.compressImage(file);
            this.editImages.push(compressed);
          } catch (error) {
            console.error('Error procesando la imagen:', error);
          }
        }
      }
      this.isCompressing = false;
      this.cdr.detectChanges();
    }
    event.target.value = '';
  }

  removeImage(index: number, event: Event) {
    event.stopPropagation();
    this.editImages.splice(index, 1);
  }

  compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
      reader.onload = (event: any) => {
        const img = new Image();
        img.onerror = (e) => reject(e);
        img.src = event.target.result;
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 600;
            const MAX_HEIGHT = 600;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/webp', 0.7);
            resolve(dataUrl);
          } catch (e) {
            reject(e);
          }
        };
      };
    });
  }

  saveProduct() {
    if (!this.product) return;
    if (!this.editTitle.trim()) {
      alert('El título es obligatorio.');
      return;
    }
    const updateData = {
      title: this.editTitle.trim(),
      price: this.editPrice,
      status: this.editStatus,
      description: this.editDescription.trim(),
      categoryId: this.editCategoryId,
      subject: this.editSubject.trim(),
      type: this.editType,
      images: this.editImages
    };
    this.apiService.updateProduct(this.product.id, updateData).subscribe({
      next: (updated) => {
        this.product = { 
          ...this.product, 
          ...updated, 
          description: updateData.description,
          subject: updateData.subject,
          categoryId: updateData.categoryId,
          type: updateData.type,
          images: updated.images || updateData.images
        };
        if (this.product.images && this.product.images.length > 0) {
          this.selectedImage = this.formatImage(this.product.images[0]);
        } else {
          this.selectedImage = 'https://images.unsplash.com/photo-1544716278-e513176f20b5?auto=format&fit=crop&q=80&w=800';
        }
        this.showEditModal = false;
        this.cdr.detectChanges();
        alert('Producto actualizado con éxito.');
      },
      error: (err) => {
        console.error('Error updating product:', err);
        alert('Hubo un error al guardar los cambios.');
      }
    });
  }
}
