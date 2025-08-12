import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService, UserProfile } from '../../services/auth.service';
import { environment } from '../../environments/environment';
import { debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { Subject } from 'rxjs';

interface ApiUser {
  USR_ID: number;
  USR_NOM: string;
  USR_MAIL: string;
  USR_DATE_DEBUT: string;
  USR_UPDATE_DATE: string;
}

interface ApiResponse {
  success: boolean;
  data: ApiUser[];
  count: number;
  timestamp: string;
}

export interface TabGroup {
  name: string;
  tabs: string[];
  icon: string;
  collapsed: boolean;
  hovered?: boolean;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <nav class="navbar-horizontal">
      <!-- Logo et titre -->
      <div class="navbar-brand" (click)="goToHome()">
        <div class="logo-robot">🤖</div>
        <h1 class="brand-title">MyJourney</h1>
      </div>

      <!-- Menu horizontal -->
      <div class="navbar-menu">
        <div *ngFor="let group of tabGroups" 
             class="menu-group"
             (mouseenter)="onGroupHover(group, true)"
             (mouseleave)="onGroupHover(group, false)">
          
          <!-- Icône du groupe -->
          <div class="group-button" 
               [class.active]="isGroupActive(group)"
               (click)="toggleGroup(group)">
            <span class="group-name">{{ group.name }}</span>
            <span class="expand-icon">{{ group.collapsed ? '▼' : '▲' }}</span>
          </div>
          
          <!-- Dropdown des onglets -->
          <div class="dropdown-menu" 
               [class.visible]="!group.collapsed || group.hovered">
            <div *ngFor="let tab of group.tabs" 
                 class="dropdown-item"
                 [class.active]="activeTab === tab"
                 (click)="onTabClick(tab)">
              {{ tab }}
            </div>
          </div>
        </div>
      </div>

      <!-- Profil utilisateur -->
      <div class="navbar-profile">
        <!-- Badge d'impersonation -->
        <div *ngIf="isImpersonating" class="impersonation-badge">
          <i class="fas fa-user-secret"></i>
          <span>{{ impersonatedEmail }}</span>
          <button class="stop-impersonation-btn" (click)="stopImpersonation()" title="Reprendre mon profil">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <img [src]="currentUser?.photoUrl || defaultPhoto" [alt]="currentUser?.displayName || 'Utilisateur'" class="profile-photo">
        <div class="profile-info">
          <span class="profile-name">{{ currentUser?.displayName || 'Utilisateur' }}</span>
          <span class="profile-email">{{ isImpersonating ? impersonatedEmail : (currentUser?.mail || '') }}</span>
        </div>
        
        <!-- Bouton d'impersonation pour les admins -->
        <button *ngIf="isAdmin() && !isImpersonating" 
                class="impersonation-btn" 
                (click)="openImpersonationModal()" 
                title="Prendre le profil d'un autre utilisateur">
          <i class="fas fa-user-secret"></i>
        </button>
        
        <button class="logout-btn" (click)="logout()" title="Se déconnecter">
          <i class="fas fa-sign-out-alt"></i>
        </button>
      </div>
    </nav>
    
    <!-- Modal d'impersonation -->
    <div *ngIf="showImpersonationModal" class="modal-overlay" (click)="closeImpersonationModal()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>Prendre le profil d'un utilisateur</h3>
          <button class="modal-close" (click)="closeImpersonationModal()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="email-input">Adresse email de l'utilisateur :</label>
            <div class="autocomplete-container">
              <input 
                type="email" 
                id="email-input"
                [value]="impersonationEmailInput"
                (input)="onEmailInputChange($event.target.value)"
                (blur)="hideUserDropdown()"
                (keyup.enter)="startImpersonation()"
                placeholder="Tapez pour rechercher un utilisateur..."
                class="email-input"
                autocomplete="off">
              
              <!-- Dropdown des suggestions -->
              <div *ngIf="showUserDropdown" class="user-dropdown">
                <div *ngIf="isLoadingUsers" class="loading-item">
                  <i class="fas fa-spinner fa-spin"></i>
                  Recherche en cours...
                </div>
                <div *ngFor="let user of filteredUsers" 
                     class="user-item"
                     (mousedown)="selectUser(user)">
                  <div class="user-info">
                    <div class="user-name">{{ user.USR_NOM }}</div>
                    <div class="user-email">{{ user.USR_MAIL }}</div>
                  </div>
                </div>
                <div *ngIf="!isLoadingUsers && filteredUsers.length === 0 && impersonationEmailInput.length >= 2" 
                     class="no-results">
                  Aucun utilisateur trouvé
                </div>
              </div>
            </div>
          </div>
          <div class="warning-message">
            <i class="fas fa-exclamation-triangle"></i>
            <span>Cette fonctionnalité est réservée aux administrateurs. Toutes les données affichées correspondront à l'utilisateur sélectionné.</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" (click)="closeImpersonationModal()">Annuler</button>
          <button class="btn-confirm" (click)="startImpersonation()" [disabled]="!impersonationEmailInput.trim()">
            Confirmer
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .navbar-horizontal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 70px;
      background: white;
      color: var(--gray-800);
      box-shadow: var(--shadow-md);
      border-bottom: 2px solid var(--primary-color);
      z-index: 100;
      display: flex;
      align-items: center;
      padding: 0 24px;
      gap: 32px;
    }

    .navbar-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      padding: 8px 12px;
      border-radius: 8px;
    }

    .navbar-brand:hover {
      background: rgba(34, 109, 104, 0.05);
    }

    .logo {
      font-size: 28px;
    }

    .logo-robot {
      font-size: 32px;
      filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.1));
    }

    .brand-title {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 20px;
      font-weight: 700;
      margin: 0;
      background: linear-gradient(45deg, var(--primary-color), var(--secondary-color));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .navbar-menu {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }

    .menu-group {
      position: relative;
    }

    .group-button {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      border-radius: 8px;
      white-space: nowrap;
    }

    .group-button:hover {
      background: rgba(34, 109, 104, 0.05);
    }

    .group-button.active {
      background: rgba(34, 109, 104, 0.1);
      border: 1px solid var(--primary-color);
    }

    .group-name {
      font-weight: 500;
      font-size: 14px;
    }

    .expand-icon {
      font-size: 10px;
      color: var(--primary-color);
      transition: transform 0.2s ease;
    }

    .dropdown-menu {
      position: absolute;
      top: 100%;
      left: 0;
      min-width: 200px;
      background: white;
      border: 1px solid var(--primary-color);
      border-radius: 8px;
      box-shadow: var(--shadow-lg);
      opacity: 0;
      visibility: hidden;
      transform: translateY(-10px);
      transition: all 0.2s ease;
      z-index: 1000;
      margin-top: 8px;
    }

    .dropdown-menu.visible {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }

    .dropdown-item {
      padding: 10px 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      border-radius: 6px;
      margin: 4px;
      font-size: 14px;
    }

    .dropdown-item:hover {
      background: rgba(37, 99, 235, 0.05);
    }

    .dropdown-item.active {
      background: var(--primary-color);
      color: white;
      font-weight: 600;
    }

    .navbar-profile {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-radius: 8px;
      transition: all 0.2s ease;
    }

    .navbar-profile:hover {
      background: rgba(34, 109, 104, 0.05);
    }

    .profile-photo {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid var(--primary-color);
      object-fit: cover;
    }

    .profile-info {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    .profile-name {
      font-weight: 500;
      color: var(--gray-700);
      font-size: 14px;
      line-height: 1.2;
    }
    
    .profile-email {
      font-size: 12px;
      color: var(--gray-500);
      line-height: 1.2;
    }
    
    .impersonation-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--warning-color);
      color: white;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-right: 12px;
    }
    
    .stop-impersonation-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      border-radius: 50%;
      width: 16px;
      height: 16px;
      cursor: pointer;
      font-size: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s;
    }
    
    .stop-impersonation-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    
    .impersonation-btn {
      background: var(--secondary-color);
      border: none;
      color: white;
      cursor: pointer;
      padding: 8px;
      border-radius: 4px;
      transition: all 0.2s ease;
      margin-left: 8px;
    }
    
    .impersonation-btn:hover {
      background: var(--primary-color);
    }
    
    .logout-btn {
      background: none;
      border: none;
      color: var(--gray-600);
      cursor: pointer;
      padding: 8px;
      border-radius: 4px;
      transition: all 0.2s ease;
      margin-left: 8px;
    }
    
    .logout-btn:hover {
      background: rgba(239, 68, 68, 0.1);
      color: var(--error-color);
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      box-shadow: var(--shadow-xl);
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid var(--gray-200);
      background: var(--secondary-color);
      color: white;
      border-radius: 12px 12px 0 0;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .modal-close {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background-color 0.2s;
    }

    .modal-close:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .modal-body {
      padding: 24px;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: var(--gray-700);
    }

    .email-input {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid var(--gray-300);
      border-radius: 8px;
      font-size: 14px;
      transition: all 0.2s;
    }

    .email-input:focus {
      outline: none;
      border-color: var(--secondary-color);
      box-shadow: 0 0 0 3px rgba(100, 206, 199, 0.1);
    }

    .autocomplete-container {
      position: relative;
    }

    .user-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: white;
      border: 1px solid var(--gray-300);
      border-top: none;
      border-radius: 0 0 8px 8px;
      box-shadow: var(--shadow-lg);
      max-height: 200px;
      overflow-y: auto;
      z-index: 1000;
    }

    .user-item {
      padding: 12px 16px;
      cursor: pointer;
      transition: background-color 0.2s;
      border-bottom: 1px solid var(--gray-100);
    }

    .user-item:hover {
      background: var(--gray-50);
    }

    .user-item:last-child {
      border-bottom: none;
    }

    .user-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .user-name {
      font-weight: 500;
      color: var(--gray-800);
      font-size: 14px;
    }

    .user-email {
      font-size: 12px;
      color: var(--gray-600);
    }

    .loading-item {
      padding: 12px 16px;
      color: var(--gray-600);
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .no-results {
      padding: 12px 16px;
      color: var(--gray-500);
      font-size: 14px;
      font-style: italic;
      text-align: center;
    }

    .warning-message {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid var(--warning-color);
      border-radius: 8px;
      color: var(--warning-color);
      font-size: 14px;
    }

    .warning-message i {
      margin-top: 2px;
      flex-shrink: 0;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 20px 24px;
      border-top: 1px solid var(--gray-200);
      background: var(--gray-50);
      border-radius: 0 0 12px 12px;
    }

    .btn-cancel {
      padding: 10px 20px;
      border: 1px solid var(--gray-300);
      background: white;
      color: var(--gray-700);
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-cancel:hover {
      background: var(--gray-50);
      border-color: var(--gray-400);
    }

    .btn-confirm {
      padding: 10px 20px;
      border: none;
      background: var(--secondary-color);
      color: white;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-confirm:hover:not(:disabled) {
      background: var(--primary-color);
    }

    .btn-confirm:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    /* Responsive */
    @media (max-width: 1024px) {
      .navbar-horizontal {
        padding: 0 16px;
        gap: 16px;
      }
      
      .group-name {
        display: none;
      }
      
      .profile-info {
        display: none;
      }
      
      .impersonation-badge {
        display: none;
      }
    }

    @media (max-width: 768px) {
      .navbar-horizontal {
        height: 60px;
        padding: 0 12px;
        gap: 8px;
      }
      
      .brand-title {
        font-size: 16px;
      }
      
      .logo {
        font-size: 24px;
        padding: 4px;
      }
    }
  `]
})
export class NavbarComponent {
  @Input() activeTab: string = 'dashboard';
  @Output() tabChange = new EventEmitter<string>();
  
  currentUser: UserProfile | null = null;
  originalUser: UserProfile | null = null;
  impersonatedEmail: string | null = null;
  showImpersonationModal = false;
  impersonationEmailInput = '';
  filteredUsers: ApiUser[] = [];
  allUsers: ApiUser[] = [];
  usersLoaded = false;
  showUserDropdown = false;
  isLoadingAllUsers = false;
  isLoadingUsers = false;
  isImpersonating = false;
  defaultPhoto = 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=100';

  private searchSubject = new Subject<string>();

  tabGroups: TabGroup[] = [
    {
      name: 'Avant la mission',
      tabs: ['LAB', 'Conflit Check', 'QAC', 'QAM', 'LDM'],
      icon: '📋',
      collapsed: true
    },
    {
      name: 'Pendant la mission',
      tabs: ['NOG', 'Checklist', 'Révision', 'Supervision'],
      icon: '⚙️',
      collapsed: true
    },
    {
      name: 'Fin de mission',
      tabs: ['NDS/CR Mission', 'QMM', 'Plaquette', 'Restitution communication client'],
      icon: '✅',
      collapsed: true
    }
  ];

  constructor(
    private authService: AuthService,
    private http: HttpClient
  ) {
    this.authService.userProfile$.subscribe(user => {
      this.currentUser = user;
      // Charger la photo de profil si elle n'est pas encore chargée
      if (user && !user.photoUrl) {
        this.loadUserPhoto();
      }
    });
    
    this.authService.originalUser$.subscribe(user => {
      this.originalUser = user;
    });
    
    this.authService.impersonatedEmail$.subscribe(email => {
      this.impersonatedEmail = email;
      this.isImpersonating = email !== null;
    });

    // Configuration de la recherche avec debounce
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(searchTerm => {
        if (!searchTerm || searchTerm.length < 2) {
          this.showUserDropdown = false;
          return of([]);
        }
        
        this.isLoadingUsers = true;
        this.showUserDropdown = true;
        
        return of(this.searchUsersInCache(searchTerm));
      })
    ).subscribe(users => {
      this.filteredUsers = users;
      this.isLoadingUsers = false;
    });

    // Charger tous les utilisateurs au démarrage
    this.loadAllUsers();
  }

  private async loadAllUsers(): Promise<void> {
    if (this.usersLoaded) return;
    
    this.isLoadingAllUsers = true;
    
    if (environment.features.enableMockData) {
      // Données de test pour le mode Bolt
      const mockUsers: ApiUser[] = [
        { USR_ID: 1, USR_NOM: "GIANG", USR_MAIL: "thomas.giang@fr.gt.com", USR_DATE_DEBUT: "2017-09-04T00:00:00.000Z", USR_UPDATE_DATE: "2025-07-28T12:30:09.820Z" },
        { USR_ID: 2, USR_NOM: "WODLING", USR_MAIL: "terence.wodling@fr.gt.com", USR_DATE_DEBUT: "2021-10-01T00:00:00.000Z", USR_UPDATE_DATE: "2025-07-28T12:30:12.203Z" },
        { USR_ID: 3, USR_NOM: "KURKDJIAN", USR_MAIL: "daniel.kurkdjian@fr.gt.com", USR_DATE_DEBUT: "1976-11-02T00:00:00.000Z", USR_UPDATE_DATE: "2025-07-28T12:30:09.820Z" },
        { USR_ID: 4, USR_NOM: "DE OLIVEIRA", USR_MAIL: "daniel.deoliveira@fr.gt.com", USR_DATE_DEBUT: "2016-11-14T00:00:00.000Z", USR_UPDATE_DATE: "2025-07-28T12:30:12.203Z" },
        { USR_ID: 5, USR_NOM: "CIVIT", USR_MAIL: "daniel.civit@fr.gt.com", USR_DATE_DEBUT: "2016-11-03T00:00:00.000Z", USR_UPDATE_DATE: "2025-07-28T12:30:12.203Z" },
        { USR_ID: 6, USR_NOM: "BIERNAT", USR_MAIL: "daniel.biernat@fr.gt.com", USR_DATE_DEBUT: "2016-06-06T00:00:00.000Z", USR_UPDATE_DATE: "2025-07-28T12:30:09.820Z" },
        { USR_ID: 7, USR_NOM: "SIMPSON", USR_MAIL: "dana.simpson@fr.gt.com", USR_DATE_DEBUT: "2015-09-28T00:00:00.000Z", USR_UPDATE_DATE: "2025-07-28T12:30:12.587Z" },
        { USR_ID: 8, USR_NOM: "WACHOWIAK", USR_MAIL: "damien.wachowiak@fr.gt.com", USR_DATE_DEBUT: "2016-06-06T00:00:00.000Z", USR_UPDATE_DATE: "2025-07-28T12:30:12.203Z" },
        { USR_ID: 10, USR_NOM: "TETILLON", USR_MAIL: "romain.tetillon@fr.gt.com", USR_DATE_DEBUT: "2016-06-13T00:00:00.000Z", USR_UPDATE_DATE: "2025-07-28T12:30:12.203Z" },
        { USR_ID: 11, USR_NOM: "MORON", USR_MAIL: "Damien.Moron@fr.gt.com", USR_DATE_DEBUT: null, USR_UPDATE_DATE: "2023-09-01T12:00:00.507Z" },
        { USR_ID: 12, USR_NOM: "MAES", USR_MAIL: "damien.maes@fr.gt.com", USR_DATE_DEBUT: "2017-12-04T00:00:00.000Z", USR_UPDATE_DATE: "2025-07-28T12:30:12.203Z" }
      ];
      
      // Filtrer les utilisateurs avec un email valide
      this.allUsers = mockUsers.filter(user => user.USR_MAIL && user.USR_MAIL.trim() !== '');
      this.usersLoaded = true;
      this.isLoadingAllUsers = false;
      return;
    }
    
    try {
      const response = await this.http.get<ApiResponse>(`${environment.apiUrl}/api/users/`).toPromise();
      if (response && response.success && response.data) {
        // Filtrer les utilisateurs avec un email valide
        this.allUsers = response.data.filter(user => user.USR_MAIL && user.USR_MAIL.trim() !== '');
        this.usersLoaded = true;
      }
    } catch (error) {
      console.error('Erreur lors du chargement des utilisateurs:', error);
      this.allUsers = [];
    } finally {
      this.isLoadingAllUsers = false;
    }
  }

  private searchUsersInCache(searchTerm: string): ApiUser[] {
    if (!searchTerm || searchTerm.length < 2) {
      return [];
    }
    
    const term = searchTerm.toLowerCase();
    return this.allUsers
      .filter(user => 
        user.USR_MAIL.toLowerCase().includes(term) ||
        user.USR_NOM.toLowerCase().includes(term)
      )
      .slice(0, 10); // Limiter à 10 résultats pour les performances
  }

  onEmailInputChange(value: string): void {
    this.impersonationEmailInput = value;
    this.searchSubject.next(value);
  }

  selectUser(user: ApiUser): void {
    this.impersonationEmailInput = user.USR_MAIL;
    this.showUserDropdown = false;
    this.filteredUsers = [];
  }

  hideUserDropdown(): void {
    // Délai pour permettre le clic sur un élément de la liste
    setTimeout(() => {
      this.showUserDropdown = false;
    }, 200);
  }

  private async loadUserPhoto(): Promise<void> {
    // Cette méthode sera appelée automatiquement par AuthService
    // lors du chargement du profil utilisateur
  }

  toggleGroup(group: TabGroup): void {
    group.collapsed = !group.collapsed;
  }

  onGroupHover(group: TabGroup, isHovered: boolean): void {
    (group as any).hovered = isHovered;
  }

  isGroupActive(group: TabGroup): boolean {
    return group.tabs.includes(this.activeTab);
  }

  onTabClick(tab: string): void {
    this.tabChange.emit(tab);
  }

  goToHome(): void {
    this.tabChange.emit('dashboard');
  }
  
  isAdmin(): boolean {
    return this.authService.isCurrentUserAdmin();
  }
  
  openImpersonationModal(): void {
    this.showImpersonationModal = true;
    this.impersonationEmailInput = '';
    this.filteredUsers = [];
    this.showUserDropdown = false;
  }
  
  closeImpersonationModal(): void {
    this.showImpersonationModal = false;
    this.impersonationEmailInput = '';
    this.filteredUsers = [];
    this.showUserDropdown = false;
  }
  
  startImpersonation(): void {
    if (this.impersonationEmailInput.trim()) {
      this.authService.impersonateUser(this.impersonationEmailInput.trim());
      this.closeImpersonationModal();
    }
  }
  
  stopImpersonation(): void {
    this.authService.stopImpersonation();
  }
  
  logout(): void {
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
      this.authService.logout();
    }
  }
}