/* Updated YouTube OAuth service using Google Identity Services (GIS) */
// Minimal type definitions for Google Identity Services
declare const google: {
  accounts: {
    oauth2: {
      initTokenClient: (params: {
        client_id: string;
        scope: string;
        callback: (response: GisTokenResponse) => void;
      }) => TokenClient;
    };
  };
};

type TokenClient = {
  requestAccessToken(): void;
};

type AuthStateListener = () => void;

type GisTokenResponse = {
  access_token?: string;
  error?: string;
  scope?: string;
};

import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../../firebase/firebaseConfig";

/** YouTube read‑only scope */
export const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

/** Custom error class for YouTube auth */
export class YouTubeAuthError extends Error {
  public code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "YouTubeAuthError";
    this.code = code;
  }
}

/**
 * YouTube OAuth service using GIS token client.
 * - Access token is kept only in memory.
 * - Cleared on Firebase logout or account switch.
 * - Provides subscribe/unsubscribe for auth‑state changes.
 */
class YouTubeAuthService {
  private accessToken: string | null = null;
  private linkedUserId: string | null = null;
  private listeners: Set<AuthStateListener> = new Set();
  private tokenClient: TokenClient | null = null;

  // Promise handling for a single concurrent request
  private pendingResolve: ((token: string) => void) | null = null;
  private pendingReject: ((error: YouTubeAuthError) => void) | null = null;
  private isRequestInProgress = false;

  constructor() {
    // React to Firebase auth state changes
    onAuthStateChanged(auth, (user: User | null) => {
      if (!user) {
        // User signed out – clear stored token and pending promises
        this.clearSession();
        this.rejectPending(new YouTubeAuthError("User signed out", "USER_SIGNED_OUT"));
      } else if (this.linkedUserId && user.uid !== this.linkedUserId) {
        // Account switched – treat as sign‑out for YouTube linkage
        this.clearSession();
        this.rejectPending(new YouTubeAuthError("Firebase user changed", "USER_CHANGED"));
      } else {
        // User is signed in (maybe first time). Update linkedUserId for consistency.
        this.linkedUserId = user.uid;
        this.notifyListeners();
      }
    });
  }

  /** Subscribe to auth‑state changes of the YouTube link */
  public subscribe(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch (e) {
        console.error("YouTubeAuth listener error", e);
      }
    });
  }

  /** Load GIS script if not already present */
  private loadGisScript(): Promise<void> {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { google?: { accounts?: { oauth2?: { initTokenClient?: unknown } } } }).google?.accounts?.oauth2?.initTokenClient
    ) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new YouTubeAuthError("Failed to load Google Identity Services script", "SCRIPT_LOAD_ERROR"));
      document.head.appendChild(script);
    });
  }

  /** Initialise the GIS token client */
  private async initTokenClient(): Promise<void> {
    if (this.tokenClient) return;
    await this.loadGisScript();
    const clientId = import.meta.env.VITE_GOOGLE_YOUTUBE_CLIENT_ID as string;
    if (!clientId) {
      throw new YouTubeAuthError("Google YouTube client ID is not set in env", "MISSING_CLIENT_ID");
    }
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: YOUTUBE_READONLY_SCOPE,
      callback: (response) => this.handleTokenResponse(response),
    });
  }

  /** Handle the GIS callback */
  private handleTokenResponse(response: GisTokenResponse): void {
    // Error from GIS (user denied, popup closed, etc.)
    if (response.error) {
      const err = response.error;
      const codeMap: Record<string, string> = {
        access_denied: "PERMISSION_DENIED",
        popup_closed_by_user: "POPUP_CLOSED",
        cancelled: "USER_CANCELLED",
      };
      const code = codeMap[err] || "UNKNOWN_GIS_ERROR";
      const message = `Google Identity Services error: ${err}`;
      this.clearSession();
      const error = new YouTubeAuthError(message, code);
      this.pendingReject?.(error);
      this.cleanupPending();
      return;
    }
    // Ensure token exists
    if (!response.access_token) {
      const error = new YouTubeAuthError("No access token received", "NO_TOKEN");
      this.pendingReject?.(error);
      this.cleanupPending();
      return;
    }
    // Verify required scope is present
    if (!response.scope || !response.scope.includes("youtube.readonly")) {
      const error = new YouTubeAuthError("Required scope missing in response", "MISSING_SCOPE");
      this.pendingReject?.(error);
      this.cleanupPending();
      return;
    }
    // Success – store token and resolve promise
    this.accessToken = response.access_token;
    const currentUser = auth.currentUser;
    this.linkedUserId = currentUser ? currentUser.uid : null;
    this.notifyListeners();
    this.pendingResolve?.(this.accessToken);
    this.cleanupPending();
  }

  /** Clean up pending promise state */
  private cleanupPending(): void {
    this.pendingResolve = null;
    this.pendingReject = null;
    this.isRequestInProgress = false;
  }

  /** Reject pending promise if any */
  private rejectPending(error: YouTubeAuthError): void {
    if (this.pendingReject) {
      this.pendingReject(error);
    }
    this.cleanupPending();
  }

  /** Request YouTube read‑only permission */
  public async requestPermission(): Promise<string> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new YouTubeAuthError("Please sign in with Google before linking YouTube.", "NOT_LOGGED_IN");
    }
    await this.initTokenClient();
    if (!this.tokenClient) {
      throw new YouTubeAuthError("Token client not initialised.", "INIT_ERROR");
    }
    if (this.isRequestInProgress) {
      throw new YouTubeAuthError("Permission request already in progress", "REQUEST_IN_PROGRESS");
    }
    this.isRequestInProgress = true;
    return new Promise<string>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      // Trigger GIS popup
      this.tokenClient!.requestAccessToken();
      // Timeout – ensure cleanup
      setTimeout(() => {
        if (this.isRequestInProgress) {
          this.clearSession();
          const err = new YouTubeAuthError("YouTube permission request timed out.", "TIMEOUT");
          reject(err);
          this.cleanupPending();
        }
      }, 30000);
    });
  }

  /** Retrieve stored access token if it matches the current Firebase user */
  public getAccessToken(): string | null {
    const user = auth.currentUser;
    if (!user || user.uid !== this.linkedUserId) return null;
    return this.accessToken;
  }

  public isLinked(): boolean {
    return Boolean(this.getAccessToken());
  }

  /** Disconnect YouTube – clear stored token */
  public disconnectYouTube(): void {
    this.clearSession();
    this.rejectPending(new YouTubeAuthError("YouTube disconnected by user", "DISCONNECTED"));
  }

  /** Helper for components to get current Firebase user */
  public getCurrentUser(): User | null {
    return auth.currentUser;
  }

  /** Clear stored token and linked user id, notify listeners */
  private clearSession(): void {
    this.accessToken = null;
    this.linkedUserId = null;
    this.notifyListeners();
  }
}

export const youtubeAuthService = new YouTubeAuthService();
