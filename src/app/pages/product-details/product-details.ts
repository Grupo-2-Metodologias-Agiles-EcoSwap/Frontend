import { Component, OnInit, ChangeDetectorRef, OnDestroy, ElementRef, ViewChild, AfterViewInit, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { Tripo3dService } from '../../services/tripo3d';
import { Product, Chat, User } from '../../models';
import { ProductCard } from '../../components/product-card/product-card';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type View3DState = 'idle' | 'generating' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [CommonModule, ProductCard, RouterLink],
  templateUrl: './product-details.html',
})
export class ProductDetails implements OnInit, OnDestroy {
  @ViewChild('threeCanvas') threeCanvas!: ElementRef<HTMLCanvasElement>;

  product: Product | null = null;
  otherProducts: Product[] = [];
  selectedImage: string = '';
  currentUser: User | null = null;
  seller: User | null = null;
  isOwner = false;

  // 3D viewer state
  is3DMode = false;
  view3DState: View3DState = 'idle';
  generationProgress = 0;
  errorMessage = '';

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private animationId!: number;
  private cachedModelUrl: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private authService: AuthService,
    private tripo3d: Tripo3dService,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit() {
    this.currentUser = this.authService.currentUser;
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadProductDetails(id);
      }
    });
  }

  ngOnDestroy() {
    this.destroyThreeJS();
  }

  loadProductDetails(id: string) {
    this.apiService.getProductById(id).subscribe(data => {
      this.product = data;
      this.cachedModelUrl = typeof data.model3d === 'string' ? data.model3d : (data.model3d?.file || null);
      if (data.images && data.images.length > 0) {
        this.selectedImage = data.images[0].startsWith('data:image') || data.images[0].startsWith('http') ? data.images[0] : 'assets/' + data.images[0];
      } else {
        this.selectedImage =
          'https://images.unsplash.com/photo-1544716278-e513176f20b5?auto=format&fit=crop&q=80&w=800';
      }

      // Check if user is owner
      const user = this.authService.currentUser;
      if (user && String(data.userId) === String(user.id)) {
        this.isOwner = true;
      }

      // If the product is not available and the current user is not the owner, redirect them
      const isAvailable = data.available === true || String(data.available) === 'true';
      if (!isAvailable && !this.isOwner) {
        alert('Este producto ya no está disponible.');
        this.router.navigate(['/catalog']);
        return;
      }

      // Load Seller Details
      this.apiService.getUserById(String(data.userId)).subscribe(sellerData => {
        this.seller = sellerData;
        this.cdr.detectChanges();
      });

      // Load other products
      this.apiService.getProducts().subscribe((allProducts) => {
        this.otherProducts = allProducts
          .filter(p => String(p.id) !== String(id) && (p.available === true || String(p.available) === 'true'))
          .slice(0, 4); // Take up to 4 other products
        this.cdr.detectChanges();
      });
      this.cdr.detectChanges();
    });
  }

  //-------3D viewer ---------

  toggle3DView() {
    this.is3DMode = !this.is3DMode;
    if (this.is3DMode) {
      if (this.cachedModelUrl) {
        // Ya fue generado antes, solo cargar
        setTimeout(() => this.initThreeJS(this.cachedModelUrl!), 100);
      } else {
        this.start3DGeneration();
      }
    } else {
      this.destroyThreeJS();
      this.view3DState = 'idle';
    }
  }

  private getFirstImageUrl(): string | null {
    if (!this.product?.images || this.product.images.length === 0) return null;
    const img = this.product.images[0];
    if (img.startsWith('http')) return img;
    if (img.startsWith('data:')) return null; // base64 necesita otro flujo
    return null;
  }

  private start3DGeneration() {
    const imageUrl = this.getFirstImageUrl();

    if (!imageUrl) {
      this.view3DState = 'error';
      this.errorMessage =
        'Este producto no tiene imágenes con URL válida para generar el modelo 3D.';
      this.cdr.detectChanges();
      return;
    }

    this.view3DState = 'generating';
    this.generationProgress = 0;
    this.cdr.detectChanges();

    // 1. Crear tarea en Tripo3D
    this.tripo3d.generateFromImageUrl(imageUrl).subscribe({
      next: (taskId) => {
        // 2. Polling hasta que termine
        this.tripo3d.pollUntilDone(taskId).subscribe({
          next: (task) => {
            this.generationProgress = task.progress;
            this.cdr.detectChanges();

            if (task.status === 'success' && task.model_url) {
              this.cachedModelUrl = task.model_url;
              this.tripo3d.saveModelUrl(Number(this.product!.id), task.model_url).subscribe();

              this.view3DState = 'loading';
              this.cdr.detectChanges();
              setTimeout(() => this.initThreeJS(task.model_url!), 100);
            } else if (task.status === 'failed') {
              this.view3DState = 'error';
              this.errorMessage = 'La generación del modelo 3D falló. Intenta de nuevo.';
              this.cdr.detectChanges();
            }
          },
          error: () => {
            this.view3DState = 'error';
            this.errorMessage = 'Error al consultar el estado del modelo.';
            this.cdr.detectChanges();
          },
        });
      },
      error: (err) => {
        this.view3DState = 'error';
        this.errorMessage =
          'Error al iniciar la generación: ' + (err?.error?.message || 'verifica tu API key.');
        this.cdr.detectChanges();
      },
    });
  }

  private initThreeJS(modelUrl: string) {
    const canvas = this.threeCanvas?.nativeElement;
    if (!canvas) return;

    const width = canvas.clientWidth || 400;
    const height = canvas.clientHeight || 400;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf8fafc);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 1, 3);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 2;

    // Cargar el .glb
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;

        // Centrar y escalar el modelo automáticamente
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));

        this.scene.add(model);
        this.view3DState = 'ready';
        this.cdr.detectChanges();
        this.animate();
      },
      (xhr) => {
        if (xhr.total > 0) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          this.generationProgress = pct;
          this.cdr.detectChanges();
        }
      },
      (error) => {
        console.error('Error cargando .glb:', error);
        this.view3DState = 'error';
        this.errorMessage = 'Error al cargar el modelo 3D.';
        this.cdr.detectChanges();
      },
    );
  }

  private animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.controls?.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  destroyThreeJS() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.controls) this.controls.dispose();
    if (this.renderer) this.renderer.dispose();
  }

  get isGenerating(): boolean {
    return this.view3DState === 'generating';
  }

  get isLoading(): boolean {
    return this.view3DState === 'loading';
  }

  get hasError(): boolean {
    return this.view3DState === 'error';
  }

  get isReady(): boolean {
    return this.view3DState === 'ready';
  }

  formatImage(img: string): string {
    if (!img) return '';
    return img.startsWith('data:image') || img.startsWith('http') ? img : 'assets/' + img;
  }


  getStars(reputation: number): number[] {
    return Array(Math.round(reputation) || 0).fill(0);
  }

  getEmptyStars(reputation: number): number[] {
    return Array(5 - (Math.round(reputation) || 0)).fill(0);
  }

  requestProduct() {
    if (!this.currentUser || !this.product) return;
    if (String(this.currentUser.id) === String(this.product.userId)) {
      alert("No puedes solicitar tu propio producto.");
      return;
    }

    // 1. Verificar si ya existe un chat para este producto con este vendedor
    this.apiService.getChats(this.currentUser.id).subscribe(chats => {
      const existingChat = chats.find(c => String(c.productId) === String(this.product!.id) && c.participants.map(String).includes(String(this.product!.userId)));

      if (existingChat) {
        // Enviar notificación al vendedor vinculada al chat existente
        this.apiService.createNotification({
          userId: this.product!.userId,
          type: 'purchase',
          chatId: existingChat.id,
          text: `${this.currentUser!.name} quiere comprar tu producto "${this.product!.title}".`,
          read: false
        }).subscribe();

        alert(`Ya has solicitado este producto. Te estamos redirigiendo al chat.`);
        this.router.navigate(['/chat'], { queryParams: { chatId: existingChat.id } });
      } else {
        // 2. Si no existe, crear la reunión/chat
        const newChat: Partial<Chat> = {
          productId: this.product!.id,
          participants: [String(this.currentUser!.id), String(this.product!.userId)],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        this.apiService.createChat(newChat).subscribe(createdChat => {
          // Crear la notificación vinculada al nuevo chat
          this.apiService.createNotification({
            userId: this.product!.userId,
            type: 'purchase',
            chatId: createdChat.id,
            text: `${this.currentUser!.name} quiere comprar tu producto "${this.product!.title}".`,
            read: false
          }).subscribe();

          alert(`Has solicitado el producto: ${this.product?.title}. Te estamos redirigiendo al chat con el vendedor.`);
          this.router.navigate(['/chat'], { queryParams: { chatId: createdChat.id } });
        });
      }
    });
  }

  contactSeller() {
    if (!this.currentUser || !this.product) return;
    if (String(this.currentUser.id) === String(this.product.userId)) {
      alert('No puedes contactarte a ti mismo.');
      return;
    }

    // Check if a chat already exists
    this.apiService.getChats(this.currentUser.id).subscribe((chats) => {
      const existingChat = chats.find(
        (c) =>
          String(c.productId) === String(this.product!.id) &&
          c.participants.map(String).includes(String(this.product!.userId)),
      );

      if (existingChat) {
        this.router.navigate(['/chat'], { queryParams: { chatId: existingChat.id } });
      } else {
        // Create new chat
        const newChat: Partial<Chat> = {
          productId: this.product!.id,
          participants: [String(this.currentUser!.id), String(this.product!.userId)],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.apiService.createChat(newChat).subscribe((createdChat) => {
          this.router.navigate(['/chat'], { queryParams: { chatId: createdChat.id } });
        });
      }
    });
  }
}
