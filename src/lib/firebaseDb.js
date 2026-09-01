import { getFirestore } from 'firebase/firestore';
import { app } from '$lib/firebase.js';

export const db = getFirestore(app);
