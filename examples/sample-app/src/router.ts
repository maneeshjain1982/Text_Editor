import { createRouter, createWebHistory } from 'vue-router'
import DocumentList from './views/DocumentList.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'documents', component: DocumentList },
    // Editor pages are lazy-loaded, so the list page doesn't download the editor.
    { path: '/documents/new', name: 'new', component: () => import('./views/DocumentEdit.vue') },
    { path: '/documents/:id/edit', name: 'edit', component: () => import('./views/DocumentEdit.vue') },
    { path: '/documents/:id', name: 'view', component: () => import('./views/DocumentView.vue') },
  ],
})
