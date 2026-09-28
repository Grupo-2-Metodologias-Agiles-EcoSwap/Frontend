import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';
import { Home } from './pages/home/home';
import { AddProduct } from './pages/add-product/add-product';
import { MyProducts } from './pages/my-products/my-products';
import { Catalog } from './pages/catalog/catalog';
import { ProductDetails } from './pages/product-details/product-details';
import { ChatComponent } from './pages/chat/chat';
import { MyProductDetails } from './pages/my-product-details/my-product-details';
import { Profile } from './pages/profile/profile';
import { Favorites } from './pages/favorites/favorites';
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
  { path: 'favorites', component: Favorites, canActivate: [authGuard] },
  { path: 'product/:id', component: ProductDetails, canActivate: [authGuard] },
  { path: 'my-product/:id', component: MyProductDetails, canActivate: [authGuard] },
  { path: 'chat', component: ChatComponent, canActivate: [authGuard] },
  { path: 'user/:id', component: PublicProfile, canActivate: [authGuard] },
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: '**', redirectTo: '/login' }
];
