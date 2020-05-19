const BaseDocument = require('@/basedocument');

const Users = require('@/users');

module.exports = class SpinBiUser extends BaseDocument {
  afterInsert() {
    Users.createUser(this);
  }

  afterUpdate() {
    Users.updateUser(this);
  }

  afterDelete() {
    Users.deleteUser(this);
  }
};
