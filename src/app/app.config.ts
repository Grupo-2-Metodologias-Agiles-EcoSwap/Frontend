import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import {provideAppInitializer, inject} from '@angular/core';
import {provideHttpClient, withInterceptors} from '@angular/common/http';
import {
  provideTranslateLoader,
  provideTranslateService,
  TranslateService,
} from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideTranslateService({
      loader: provideTranslateHttpLoader({prefix: './assets/i18n/', suffix: '.json'}),
      lang: 'en',
      fallbackLang: 'en'
    }),
    provideAppInitializer(()=>{
      const translate = inject(TranslateService);
      translate.use(translate.getBrowserLang()|| "en");
    })
  ]
};
