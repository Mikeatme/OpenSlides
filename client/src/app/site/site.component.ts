import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSidenav } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Title } from '@angular/platform-browser';
import { ActivationEnd, NavigationEnd, Router } from '@angular/router';

import { TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs/operators';

import { navItemAnim, pageTransition } from '../shared/animations';
import { OfflineService } from 'app/core/core-services/offline.service';
import { ConfigService } from 'app/core/ui-services/config.service';
import { OverlayService } from 'app/core/ui-services/overlay.service';
import { UpdateService } from 'app/core/ui-services/update.service';
import { langToLocale } from 'app/shared/utils/lang-to-locale';
import { AuthService } from '../core/core-services/auth.service';
import { BaseComponent } from '../base.component';
import { MainMenuService } from '../core/core-services/main-menu.service';
import { OpenSlidesStatusService } from '../core/core-services/openslides-status.service';
import { OperatorService } from '../core/core-services/operator.service';
import { TimeTravelService } from '../core/core-services/time-travel.service';
import { ViewportService } from '../core/ui-services/viewport.service';

/**
 * Interface to describe possible routing data
 */
interface RoutingData {
    basePerm?: string;
    noInterruption?: boolean;
}

@Component({
    selector: 'os-site',
    animations: [pageTransition, navItemAnim],
    templateUrl: './site.component.html',
    styleUrls: ['./site.component.scss']
})
export class SiteComponent extends BaseComponent implements OnInit {
    /**
     * HTML element of the side panel
     */
    @ViewChild('sideNav', { static: true })
    public sideNav: MatSidenav;

    /**
     * Get the username from the operator (should be known already)
     */
    public username: string;

    /**
     * is the user logged in, or the anonymous is active.
     */
    public isLoggedIn: boolean;

    /**
     * Indicates, whether the user is offline or not.
     */
    public isOffline: boolean;

    /**
     * Holds the typed search query.
     */
    public searchform: FormGroup;

    /**
     * Hold the current routing data to make certain checks
     */
    private routingData: RoutingData;

    /**
     * Set to true if an update was suppressed
     */
    private delayedUpdateAvailable = false;

    /**
     * Constructor
     *
     * @param authService
     * @param route
     * @param operator
     * @param vp
     * @param translate
     * @param dialog
     * @param mainMenuService
     * @param OSStatus
     * @param timeTravel
     */
    public constructor(
        title: Title,
        protected translate: TranslateService,
        configService: ConfigService,
        offlineService: OfflineService,
        private updateService: UpdateService,
        private authService: AuthService,
        private router: Router,
        public operator: OperatorService,
        public vp: ViewportService,
        public dialog: MatDialog,
        public mainMenuService: MainMenuService,
        public OSStatus: OpenSlidesStatusService,
        public timeTravel: TimeTravelService,
        private matSnackBar: MatSnackBar,
        private overlayService: OverlayService
    ) {
        super(title, translate);
        overlayService.setSpinner(true, translate.instant('Loading data. Please wait...'));

        this.operator.getViewUserObservable().subscribe(user => {
            if (user) {
                this.username = user.short_name;
            } else if (!user && configService.instant<boolean>('general_system_enable_anonymous')) {
                this.username = translate.instant('Guest');
            }
            this.isLoggedIn = !!user;
        });

        offlineService.isOffline().subscribe(offline => {
            this.isOffline = offline;
        });

        this.searchform = new FormGroup({ query: new FormControl([]) });

        // detect routing data such as base perm and noInterruption
        this.router.events
            .pipe(filter(event => event instanceof ActivationEnd && event.snapshot.children.length === 0))
            .subscribe((event: ActivationEnd) => {
                this.routingData = event.snapshot.data as RoutingData;

                // if the current route has no "noInterruption" flag and an update is available, show the update
                if (this.delayedUpdateAvailable && !this.routingData.noInterruption) {
                    this.showUpdateNotification();
                }
            });
    }

    /**
     * Initialize the site component
     */
    public ngOnInit(): void {
        this.vp.checkForChange();

        // observe the mainMenuService to receive toggle-requests
        this.mainMenuService.toggleMenuSubject.subscribe((value: void) => this.toggleSideNav());

        // get a translation via code: use the translation service
        // this.translate.get('Motions').subscribe((res: string) => {
        //      console.log('translation of motions in the target language: ' + res);
        //  });

        // TODO: Remove this, when the ESR version of Firefox >= 64.
        const agent = navigator.userAgent.toLowerCase();
        if (agent.indexOf('firefox') > -1) {
            const index = agent.indexOf('firefox') + 8;
            const version = +agent.slice(index, index + 2);

            if (version < 64) {
                const sideNav = document.querySelector(
                    'mat-sidenav.side-panel > div.mat-drawer-inner-container'
                ) as HTMLElement;
                sideNav.style.overflow = 'hidden';
                sideNav.addEventListener('MozMousePixelScroll', (event: any) => {
                    sideNav.scrollBy(0, event.detail);
                });
            }
        }

        this.router.events.subscribe(event => {
            // Scroll to top if accessing a page, not via browser history stack
            if (event instanceof NavigationEnd) {
                const contentContainer = document.querySelector('.mat-sidenav-content');
                if (contentContainer) {
                    contentContainer.scrollTo(0, 0);
                }
            }
        });

        // check for updates
        this.updateService.updateObservable.subscribe(() => {
            if (this.routingData.noInterruption) {
                this.delayedUpdateAvailable = true;
            } else {
                this.showUpdateNotification();
            }
        });
    }

    /**
     * Shows the update notification
     */
    private showUpdateNotification(): void {
        const ref = this.matSnackBar.open(
            this.translate.instant('A new update is available!'),
            this.translate.instant('Refresh'),
            {
                duration: 0
            }
        );

        // Enforces an update
        ref.onAction().subscribe(() => {
            this.updateService.applyUpdate();
        });
    }

    /**
     * Toggles the side nav
     */
    public toggleSideNav(): void {
        this.sideNav.toggle();
    }

    /**
     * Shows the `super-search.component`,
     * only if the user is on a mobile device.
     */
    public toggleSearch(): void {
        this.overlayService.showSearch();
        this.mobileAutoCloseNav();
    }

    /**
     * Automatically close the navigation in while navigating in mobile mode
     */
    public mobileAutoCloseNav(): void {
        if (this.vp.isMobile) {
            this.sideNav.close();
        }
    }

    /**
     * Let the user change the language
     * @param lang the desired language (en, de, cs, ...)
     */
    public selectLang(selection: string): void {
        this.translate.use(selection).subscribe();
    }

    /**
     * Get the name of a Language by abbreviation.
     *
     * @param abbreviation The abbreviation of the languate or null, if the current
     * language should be used.
     */
    public getLangName(abbreviation?: string): string {
        if (!abbreviation) {
            abbreviation = this.translate.currentLang;
        }

        if (abbreviation === 'en') {
            return 'English';
        } else if (abbreviation === 'de') {
            return 'Deutsch';
        } else if (abbreviation === 'cs') {
            return 'Čeština';
        }
    }

    /**
     * Function to log out the current user
     */
    public logout(): void {
        this.authService.logout();
        this.overlayService.logout();
    }

    /**
     * Handle swipes and gestures
     */
    public swipe(e: TouchEvent, when: string): void {
        const coord: [number, number] = [e.changedTouches[0].pageX, e.changedTouches[0].pageY];
        const time = new Date().getTime();

        if (when === 'start') {
            this.swipeCoord = coord;
            this.swipeTime = time;
        } else if (when === 'end') {
            const direction = [coord[0] - this.swipeCoord[0], coord[1] - this.swipeCoord[1]];
            const duration = time - this.swipeTime;
            if (
                duration < 1000 &&
                Math.abs(direction[0]) > 30 && // swipe length to be detected
                Math.abs(direction[0]) > Math.abs(direction[1] * 3) // 30° should be "horizontal enough"
            ) {
                // definition of a "swipe right" gesture to move in the navigation
                // only works in the far left edge of the screen
                if (
                    direction[0] > 0 && // swipe left to right
                    this.swipeCoord[0] < 20
                ) {
                    this.sideNav.open();
                }

                // definition of a "swipe left" gesture to remove the navigation
                // should only work in mobile mode to prevent unwanted closing of the nav
                // works anywhere on the screen
                if (
                    direction[0] < 0 && // swipe left to right
                    this.vp.isMobile
                ) {
                    this.sideNav.close();
                }
            }
        }
    }

    /**
     * Get the timestamp for the current point in history mode.
     * Tries to detect the ideal timestamp format using the translation service
     *
     * @returns the timestamp as string
     */
    public getHistoryTimestamp(): string {
        return this.OSStatus.getHistoryTimeStamp(langToLocale(this.translate.currentLang));
    }

    /**
     * Function to open the global `super-search.component`.
     *
     * @param event KeyboardEvent to listen to keyboard-inputs.
     */
    @HostListener('document:keydown', ['$event']) public onKeyNavigation(event: KeyboardEvent): void {
        if (event.altKey && event.shiftKey && event.code === 'KeyF') {
            this.overlayService.showSearch();
        }
    }
}
