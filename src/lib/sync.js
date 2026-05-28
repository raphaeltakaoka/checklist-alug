import { db, storage } from "./firebase.js";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { saveInspection } from "./db.js";

/**
 * Helper to upload a base64 photo to Firebase Storage and return its public URL.
 * If it is already a URL or empty, returns it as is.
 */
async function uploadPhoto(path, dataUrl) {
	if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
		return dataUrl;
	}
	const storageRef = ref(storage, path);
	await uploadString(storageRef, dataUrl, "data_url");
	return await getDownloadURL(storageRef);
}

/**
 * Synchronizes a completed inspection to Firebase Storage and Cloud Firestore.
 * Converts all local base64 photos to permanent HTTPS storage links.
 * Updates local IndexedDB with synced: true status and lightweight URLs.
 */
export async function syncInspectionToCloud(inspection) {
	// Create a clean deep copy to avoid modifying original reactive proxy state directly before success
	const report = JSON.parse(JSON.stringify(inspection));

	// 1. Upload license/ID photo if present
	if (report.clientLicensePhoto) {
		report.clientLicensePhoto = await uploadPhoto(
			`checklists/${report.id}/license.jpg`,
			report.clientLicensePhoto
		);
	}

	// 2. Upload damage photos for all parts
	if (report.partStates) {
		for (const partKey in report.partStates) {
			const part = report.partStates[partKey];
			if (part.photos && part.photos.length > 0) {
				const uploadedPhotos = [];
				for (let i = 0; i < part.photos.length; i++) {
					const photoUrl = part.photos[i];
					const uploadedUrl = await uploadPhoto(
						`checklists/${report.id}/parts/${partKey}_${i}.jpg`,
						photoUrl
					);
					uploadedPhotos.push(uploadedUrl);
				}
				part.photos = uploadedPhotos;
			}
		}
	}

	// 3. Save report to Cloud Firestore (collection "checklists")
	const docRef = doc(db, "checklists", report.id);
	// Ensure synced status is true
	report.synced = true;
	await setDoc(docRef, report);

	// 4. Update the local IndexedDB database with the synced status and new public URLs
	await saveInspection(report);

	return report;
}
