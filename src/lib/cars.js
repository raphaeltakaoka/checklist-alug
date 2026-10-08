export function normalizePlate(value) {
	return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : '';
}

export function linkInspectionCar(report, car) {
	report.carId = car.id;
	report.licensePlate = normalizePlate(car.plate);
}

export function unlinkInspectionCar(report) {
	report.carId = null;
	report.licensePlate = '';
}
