export class Medicine {
  constructor({ id, name, description, dosage, unit, notes, startDate, endDate, active, createdAt, updatedAt }) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.dosage = dosage;
    this.unit = unit;
    this.notes = notes;
    this.startDate = startDate;
    this.endDate = endDate;
    this.active = Boolean(active);
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
