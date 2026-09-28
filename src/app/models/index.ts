export interface User {
  id: number | string;
  name: string;
  email: string;
  password?: string;
  avatar?: string;
  universityId: number | string;
  career: string;
  cycle: number;
  reputation: number;
  verified: boolean;
  active: boolean;
  createdAt: string;
  favorites?: (number | string)[];
}

export interface University {
  id: number | string;
  name: string;
}

export interface Category {
  id: number | string;
  name: string;
}

export interface Model3D {
  file: string;
  texture: string;
  preview: string;
  scale: number;
  initialRotation: number[];
}

export interface Product {
  id: number | string;
  title: string;
  description: string;
  price: number;
  status: string;
  categoryId: number | string;
  userId: number | string;
  available: boolean;
  type?: 'sale' | 'wanted';
  createdAt: string;
  images: string[];
  model3d?: string | Model3D;
  subject?: string;
}

export interface Chat {
  id: number | string;
  productId: number | string;
  participants: (number | string)[];
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id?: number | string;
  chatId: number | string;
  senderId: number | string;
  text: string;
  type?: 'text' | 'meetup' | 'system';
  meetup?: {
    locationId?: string | null;
    locationName?: string;
    location: string;
    date: string;
    time: string;
    notes?: string;
    status: 'pending' | 'accepted' | 'declined';
  };
  createdAt: string;
}

export interface Notification {
  id: number | string;
  userId: number | string;
  type: string;
  text?: string;
  title?: string;
  message?: string;
  chatId?: number | string;
  read: boolean;
  createdAt: string;
}

export interface Review {
  id?: number | string;
  reviewerId: number | string;
  targetUserId: number | string;
  rating: number;
  comment: string;
  createdAt: string;
}
