const { _ } = require('frappejs/utils');

module.exports = {
    "name": "SpinBiUserRole",
    label: _("User Role"),
    "doctype": "DocType",
    "isSingle": 0,
    "isChild": 1,
    "keywordFields": [],
    "tableFields": ["role"],
    "fields": [
        {
            "fieldname": "role",
            "label": "Role",
            "fieldtype": "Link",
            "target": "Role"
        }
    ]
}