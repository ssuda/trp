const BaseDocument = require('@/basedocument');
const Users = require('@/users').default;

module.exports = class SpinBiUser extends BaseDocument {
  async afterInsert() {
    if (!this.userId) {
      await Users.createUser(this);
    }
  }

  async afterUpdate() {
    await Users.updateUser(this);
  }

  async afterDelete() {
    await Users.deleteUser(this);
  }
};
