const BaseDocument = require('frappejs/model/document');
const Users = require('@/users').default;

module.exports = class SpinBiUser extends BaseDocument {
  async afterInsert() {
    if (!this.userId) {
      await Users.createUser(this);
    }
  }

  async afterUpdate() {
    if (this.userId) {
      await Users.updateUser(this);
    }
  }

  async afterDelete() {
    if (this.userId) {
      await Users.deleteUser(this);
    }
  }
};
