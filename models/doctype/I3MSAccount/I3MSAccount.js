module.exports = {
  name: 'I3MSAccount',
  label: 'I3MS Account',
  doctype: 'DocType',
  //documentClass: require('./AccountDocument.js'),
  isSingle: 0,
  //isTree: 1,
  keywordFields: ['name', 'username'],
  fields: [
    {
      fieldname: 'name',
      label: 'Account Name',
      fieldtype: 'Data',
      required: 1,
      placeholder: 'Account Name'
    },
    {
      fieldname: 'username',
      label: 'User Name',
      fieldtype: 'Data',
      required: 1,
    },
    {
      fieldname: 'password',
      label: 'Password',
      fieldtype: 'Password',
      required: 1
    }
  ],

  quickEditFields: ['name', 'username', 'password']
};
