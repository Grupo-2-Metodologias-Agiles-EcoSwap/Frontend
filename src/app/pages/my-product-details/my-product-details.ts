import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
  ) { }

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

      this.editForm = this.fb.group({
        type: [data.type || 'sale', Validators.required],
        title: [data.title, Validators.required],
        description: [data.description, Validators.required],
        price: [data.price, [Validators.required, Validators.min(0)]],
        status: [data.status, Validators.required],
        categoryId: [String(data.categoryId), Validators.required],
      });

      this.cdr.detectChanges();
    });
  }

  enterEditMode() {
    this.isEditMode = true;
    this.saveSuccess = false;
  }

  cancelEdit() {
    this.isEditMode = false;
    this.imagesBase64 = this.product?.images ? [...this.product.images] : [];
    this.editForm.patchValue({
      type: this.product?.type || 'sale',
      title: this.product?.title,
      description: this.product?.description,
      price: this.product?.price,
      status: this.product?.status,
      categoryId: this.product?.categoryId,
    });
  }

  saveChanges() {
    if (!this.editForm.valid || !this.product) return;

    const updated = {
      ...this.product,
      ...this.editForm.value,
      price: Number(this.editForm.value.price),
      categoryId: Number(this.editForm.value.categoryId),
      images: this.imagesBase64,
    };

    this.apiService.updateProduct(this.product.id, updated).subscribe((data) => {
      this.product = data;
      this.isEditMode = false;
      this.saveSuccess = true;
      if (data.images && data.images.length > 0) {
        this.selectedImage =
          data.images[0].startsWith('data:image') || data.images[0].startsWith('http')
            ? data.images[0]
            : 'assets/' + data.images[0];
      }
      setTimeout(() => (this.saveSuccess = false), 3000);
      this.cdr.detectChanges();
    });
  }

  toggleAvailability() {
    if (!this.product) return;
    const updated = { ...this.product, available: !this.isAvailable };
    this.apiService.updateProduct(this.product.id, updated).subscribe((data) => {
      this.isAvailable = data.available;
      this.product = data;
      this.cdr.detectChanges();
    });
  }

  confirmDelete() {
    this.deleteConfirm = true;
  }

  cancelDelete() {
    this.deleteConfirm = false;
  }

  deleteProduct() {
    if (!this.product) return;
    this.apiService.deleteProduct(this.product.id).subscribe(() => {
      this.router.navigate(['/my-products']);
    });
  }

  async onFileSelected(event: any) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    this.isCompressing = true;
    this.cdr.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 50));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.match(/image\/*/)) {
        try {
          const compressed = await this.compressImage(file);
          this.imagesBase64.push(compressed);
        } catch (error) {
          console.error('Error procesando imagen:', error);
        }
      }
    }
    this.isCompressing = false;
    this.cdr.detectChanges();
    event.target.value = '';
  }

  removeImage(index: number, event: Event) {
    event.stopPropagation();
    this.imagesBase64.splice(index, 1);
  }

  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.imagesBase64, event.previousIndex, event.currentIndex);
  }

  openPreview(img: string) {
    this.previewImage = img;
  }

  closePreview() {
    this.previewImage = null;
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
            const MAX = 600;
            let w = img.width,
              h = img.height;
            if (w > h) {
              if (w > MAX) {
                h *= MAX / w;
                w = MAX;
              }
            } else {
              if (h > MAX) {
                w *= MAX / h;
                h = MAX;
              }
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/webp', 0.7));
          } catch (e) {
            reject(e);
          }
        };
      };
    });
  }
}
