import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { User, Product, Review } from '../../models';
import { ProductCard } from '../../components/product-card/product-card';

@Component({
  selector: 'app-public-profile',
  standalone: true,
  imports: [CommonModule, ProductCard, ReactiveFormsModule],
  templateUrl: './public-profile.html',
})
export class PublicProfile implements OnInit {
  user: User | null = null;
  products: Product[] = [];
  reviews: Review[] = [];
  reviewers: { [id: string]: User } = {};
  
  loading = true;
  currentUser: User | null = null;
  
  showReviewForm = false;
  canReview = false;
  eligibleMeetingId: string | null = null;
  reviewForm: FormGroup;
  submittingReview = false;
  
  showDeleteModal = false;
  reviewToDelete: Review | null = null;
  deletingReview = false;

  constructor(
    private route: ActivatedRoute,
    private apiService: ApiService,
    private authService: AuthService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {
    this.reviewForm = this.fb.group({
      rating: [5, [Validators.required, Validators.min(1), Validators.max(5)]],
      comment: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  ngOnInit() {
    this.authService.currentUser$.subscribe(u => this.currentUser = u);

    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadProfileData(id);
      }
    });
  }

  loadProfileData(userId: string) {
    this.loading = true;
    
    // Fetch User
    this.apiService.getUserById(userId).subscribe({
      next: (user) => {
        this.user = user;
        
        // Fetch User's Products
        this.apiService.getProductsByUserId(userId).subscribe({
          next: (products) => {
            this.products = products.filter(p => p.available);
            this.cdr.detectChanges();
          },
          error: () => {
            this.products = [];
            this.cdr.detectChanges();
          }
        });

        // Fetch User's Reviews
        this.apiService.getReviews(userId).subscribe({
          next: (reviews) => {
            this.reviews = reviews;
            this.checkEligibility(userId);
            
            // Fetch reviewers data to display their names/avatars
            const reviewerIds = [...new Set(reviews.map(r => r.reviewerId))];
            if (reviewerIds.length === 0) {
              this.loading = false;
              this.cdr.detectChanges();
            } else {
              let loaded = 0;
              reviewerIds.forEach(rId => {
                if (!this.reviewers[rId]) {
                   this.apiService.getUserById(rId).subscribe({
                    next: (reviewer) => {
                      this.reviewers[rId] = reviewer;
                      loaded++;
                      if (loaded === reviewerIds.length) {
                        this.loading = false;
                        this.cdr.detectChanges();
                      }
                    },
                    error: () => {
                      loaded++;
                      if (loaded === reviewerIds.length) {
                        this.loading = false;
                        this.cdr.detectChanges();
                      }
                    }
                  });
                } else {
                  loaded++;
                  if (loaded === reviewerIds.length) {
                    this.loading = false;
                    this.cdr.detectChanges();
                  }
                }
              });
            }
          },
          error: () => {
            this.reviews = [];
            this.loading = false;
            this.cdr.detectChanges();
          }
        });
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  checkEligibility(userId: string) {
    this.canReview = false;
    this.eligibleMeetingId = null;

    if (this.currentUser && String(this.currentUser.id) !== String(userId)) {
      this.apiService.getMyMeetings().subscribe({
        next: (meetings) => {
          const eligibleMeeting = meetings.find(m => {
            const chat = m.chats;
            const isParticipant = chat && (String(chat.buyer_id) === String(userId) || String(chat.seller_id) === String(userId));
            return m.status === 'confirmed' && isParticipant;
          });

          if (eligibleMeeting) {
            // Verificar si el usuario actual ya calificó esta reunión en específico
            const alreadyReviewed = this.reviews.some(r => String(r.reviewerId) === String(this.currentUser!.id));
            if (!alreadyReviewed) {
              this.canReview = true;
              this.eligibleMeetingId = eligibleMeeting.id;
            }
          }
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error al comprobar elegibilidad de reseña:', err);
        }
      });
    }
  }

  getStars(rating: number): number[] {
    return Array(Math.round(rating) || 0).fill(0);
  }

  getEmptyStars(rating: number): number[] {
    return Array(5 - (Math.round(rating) || 0)).fill(0);
  }

  setRating(val: number) {
    this.reviewForm.patchValue({ rating: val });
  }

  submitReview() {
    if (this.reviewForm.invalid || !this.currentUser || !this.user) return;
    
    this.submittingReview = true;
    
    const newReview: Partial<Review> & { meetingId?: number | string } = {
      reviewerId: isNaN(Number(this.currentUser.id)) ? String(this.currentUser.id) : Number(this.currentUser.id),
      targetUserId: isNaN(Number(this.user.id)) ? String(this.user.id) : Number(this.user.id),
      rating: this.reviewForm.value.rating,
      comment: this.reviewForm.value.comment,
      meetingId: this.eligibleMeetingId || undefined,
      createdAt: new Date().toISOString()
    };

    this.apiService.addReview(newReview).subscribe({
      next: (res: any) => {
        // The backend returns the new average or we can map the response
        const totalScore = this.reviews.reduce((sum, r) => sum + r.rating, 0) + (newReview.rating || 5);
        const count = this.reviews.length + 1;
        const newReputation = Number((totalScore / count).toFixed(1));

        // Create a mapped review object to append to list
        const reviewWithId: Review = {
          id: res.review?.id || res.id || Math.random().toString(),
          reviewerId: newReview.reviewerId!,
          targetUserId: newReview.targetUserId!,
          rating: newReview.rating!,
          comment: newReview.comment!,
          createdAt: newReview.createdAt!
        };

        this.reviews.unshift(reviewWithId);
        if (this.currentUser) this.reviewers[this.currentUser.id] = this.currentUser;
        if (this.user) this.user.reputation = res.newReputation !== undefined ? res.newReputation : newReputation;

        this.showReviewForm = false;
        this.submittingReview = false;
        this.reviewForm.reset({ rating: 5, comment: '' });
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al enviar la reseña:', err);
        this.submittingReview = false;
        alert('Ocurrió un error al enviar la reseña.');
        this.cdr.detectChanges();
      }
    });
  }

  promptDeleteReview(review: Review) {
    this.reviewToDelete = review;
    this.showDeleteModal = true;
  }

  cancelDelete() {
    this.reviewToDelete = null;
    this.showDeleteModal = false;
  }

  confirmDelete() {
    if (!this.reviewToDelete || !this.reviewToDelete.id || !this.user) return;
    
    this.deletingReview = true;
    this.apiService.deleteReview(this.reviewToDelete.id).subscribe({
      next: () => {
        this.reviews = this.reviews.filter(r => r.id !== this.reviewToDelete!.id);
        
        // Calcular nueva reputación
        const totalScore = this.reviews.reduce((sum, r) => sum + r.rating, 0);
        const newReputation = this.reviews.length > 0 ? Number((totalScore / this.reviews.length).toFixed(1)) : 5.0;
        
        if (this.user) this.user.reputation = newReputation;
        this.deletingReview = false;
        this.cancelDelete();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al eliminar reseña:', err);
        this.deletingReview = false;
        this.cancelDelete();
        alert('Ocurrió un error al eliminar la reseña.');
        this.cdr.detectChanges();
      }
    });
  }
}
