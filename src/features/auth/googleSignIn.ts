import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase/firebaseConfig";

// Firebase identity only. YouTube/GIS authorization is a separate opt-in flow.
export function signInWithGoogleAccount() {
  return signInWithPopup(auth, new GoogleAuthProvider());
}
