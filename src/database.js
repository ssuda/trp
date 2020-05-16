const frappe = require('frappejs');
const mysql = require('mysql');
const Database = require('frappejs/backends/database');
const debug = process.env.NODE_ENV === 'development';

module.exports = class mysqlDatabase extends Database {
    constructor(options) {
        super();
        this.timestamps = false;
        this.db_name = options.database;
        this.connectionParams = {
            client: 'mysql',
            connection: options,
            pool: { min: 0, max: 7 },
            debug: debug
        };
    }

    async getTableColumns(doctype) {
        let ret = (await this.run(`SHOW COLUMNS FROM ${doctype}`))
        console.log('called get columns for', doctype, ret);
        ret = ret[0].map(d => d.Field);
        console.log('called get columns for', doctype, ret);
        return ret;
    }

    async runRemoveColumnQuery(doctype, column) {
        await this.run(`ALTER TABLE ${doctype} REMOVE COLUMN ${column}`);
    }

    async addForeignKeys(doctype, newForeignKeys) {
        // await this.sql('SET FOREIGN_KEY_CHECKS = 0');
        // await this.sql('START TRANSACTION');
    
        // const tempName = 'TEMP' + doctype;
    
        // // create temp table
        // await this.createTable(doctype, tempName);
    
        // // copy from old to new table
        // await this.knex(tempName).insert(this.knex.select().from(doctype));
    
        // // drop old table
        // await this.knex.schema.dropTable(doctype);
    
        // // rename new table
        // await this.knex.schema.renameTable(tempName, doctype);
    
        // await this.sql('COMMIT');
        // await this.sql('SET FOREIGN_KEY_CHECKS = 1');
      }
    

    buildColumnForTable(table, field) {

        if (!this.timestamps) {
            this.timestamps = true;
            table.timestamps(true, true);
        }

        let columnType = this.getColumnType(field);

        if (debug) {
            console.log(columnType);
        }
        columnType = columnType.replace(/[\(\)]/g, ',');

        if (debug) {
            console.log(columnType);
        }

        const arr = columnType.split(',').map(s => s.trim()).filter(Boolean);

        if (debug) {
            console.log(arr);
        }

        let column = table[arr[0]](field.fieldname, ...arr.splice(0, 1));
    
        // primary key
        if (field.fieldname === 'name') {
          column.primary();
        }
    
        // default value
        if (field.default) {
          column.defaultTo(field.default);
        }
    
        // required
        if (field.required) {
          column.notNullable();
        }
    
        // link
        if (field.fieldtype === 'Link' && field.target) {
          let meta = frappe.getMeta(field.target);
          table
            .foreign(field.fieldname)
            .references('name')
            .inTable(meta.getBaseDocType())
            .onUpdate('CASCADE')
            .onDelete('RESTRICT');
        }
      }

    initTypeMap() {
        this.typeMap = {
            'AutoComplete': 'string(140)'
            , 'Currency': 'float'
            , 'integer': 'integer'
            , 'Float': 'decimal(18,6)'
            , 'Percent': 'float'
            , 'Check': 'integer(1)'
            , 'Small Text': 'text'
            , 'Long Text': 'text'
            , 'Code': 'text'
            , 'Text Editor': 'text'
            , 'Date': 'date'
            , 'DateTime': 'datetime'
            , 'Time': 'time'
            , 'Text': 'text'
            , 'Data': 'string(140)'
            , 'Link': ' string(140)'
            , 'DynamicLink': 'text'
            , 'Password': 'string(140)'
            , 'Select': 'string(140)'
            , 'Read Only': 'string(140)'
            , 'File': 'text'
            , 'Attach': 'text'
            , 'Attach Image': 'text'
            , 'Signature': 'text'
            , 'Color': 'text'
            , 'Barcode': 'text'
            , 'Geolocation': 'text'
        }
    }
}