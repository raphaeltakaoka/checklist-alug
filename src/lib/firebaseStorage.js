import { getStorage } from 'firebase/storage';
import { app } from '$lib/firebase.js';

export const storage = getStorage(app);
