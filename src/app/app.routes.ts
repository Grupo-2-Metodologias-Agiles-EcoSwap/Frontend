import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';
import { Home } from './pages/home/home';
import { AddProduct } from './pages/add-product/add-product';
import { MyProducts } from './pages/my-products/my-products';
import { Catalog } from './pages/catalog/catalog';
import { ProductDetails } from './pages/product-details/product-details';
import { MyProductDetails } from './pages/my-product-details/my-product-details';
import { Profile } from './pages/profile/profile';
import { PublicProfile } from './pages/public-profile/public-profile';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: 'home', component: Home, canActivate: [authGuard] },
  { path: 'profile', component: Profile, canActivate: [authGuard] },
  { path: 'add-product', component: AddProduct, canActivate: [authGuard] },
  { path: 'my-products', component: MyProducts, canActivate: [authGuard] },
  { path: 'catalog', component: Catalog, canActivate: [authGuard] },
  { path: 'product/:id', component: ProductDetails, canActivate: [authGuard] },
  { path: 'my-product/:id', component: MyProductDetails, canActivate: [authGuard] },
  { path: 'user/:id', component: PublicProfile, canActivate: [authGuard] },
  // Deshabilitados para Trabajo Parcial (Reservados para Trabajo Final)
  { path: 'chat', redirectTo: '/home' },
  { path: 'favorites', redirectTo: '/home' },
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: '**', redirectTo: '/login' }
];
