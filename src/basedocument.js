import frappe from 'frappejs';

class BaseDocument extends frappe.BaseDocument {
  async compareWithCurrentDoc() {
    if (frappe.isServer && !this.isNew()) {
      let currentDoc = await frappe.db.get(this.doctype, this.name);

      // check for conflict
      console.log(
        'modified',
        this.modified,
        currentDoc.modified,
        typeof this.modified,
        this.modified.getTime() == currentDoc.modified.getTime()
      );

      if (
        currentDoc &&
        this.modified.getTime() != currentDoc.modified.getTime()
      ) {
        throw new frappe.errors.Conflict(
          frappe._('Document {0} {1} has been modified after loading', [
            this.doctype,
            this.name
          ])
        );
      }

      if (this.submitted && !this.meta.isSubmittable) {
        throw new frappe.errors.ValidationError(
          frappe._('Document type {1} is not submittable', [this.doctype])
        );
      }

      // set submit action flag
      if (this.submitted && !currentDoc.submitted) {
        this.flags.submitAction = true;
      }

      if (currentDoc.submitted && !this.submitted) {
        this.flags.revertAction = true;
      }
    }
  }
}
