const frappe = require('frappejs');
const Database = require('frappejs/backends/database');
const debug = process.env.NODE_ENV === 'development';

const { DateTime } = require('luxon');

module.exports = class PostgresDatabase extends Database {
  constructor(options) {
    super();
    this.timestamps = false;
    this.connectionParams = {
      client: 'pg',
      ...options,
      pool: { min: 0, max: 7 },
      debug: debug
    };

    console.log(this.connectionParams);
  }

  getFormattedValue(field, value) {
    if (value instanceof Date) {
      if (field.fieldtype === 'Date') {
        // date
        return DateTime.fromJSDate(value).toFormat('yyyy-LL-dd');
      } else {
        // datetime
        return DateTime.fromJSDate(value).toISO();
      }
    }
    return super.getFormattedValue(field, value);
  }

  async getTableColumns(doctype) {
    let ret = await this.sql(
      `select column_name from information_schema.columns where table_name = '${doctype}'`
    );
    console.log('called get columns for', doctype, ret);
    ret = ret.rows.map(d => d.column_name);
    console.log('called get columns for', doctype, ret);
    return ret;
  }

  async runRemoveColumnQuery(doctype, column) {
    await this.run(`ALTER TABLE ${doctype} DROP COLUMN IF EXISTS ${column}`);
  }

  async addForeignKeys(doctype, newForeignKeys) {
    //   await this.sql("SET session_replication_role = 'replica'");
    //   await this.sql('BEGIN');
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
    // await this.sql("SET session_replication_role = 'origin'");
  }

  buildColumnForTable(table, field) {
    let columnType = this.getColumnType(field);

    if (debug) {
      console.log(columnType, field);
    }
    columnType = columnType.replace(/[\(\)]/g, ',');

    if (debug) {
      console.log(columnType);
    }

    const arr = columnType
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

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
      AutoComplete: 'string(140)',
      Currency: 'float',
      integer: 'integer',
      Int: 'integer',
      Float: 'decimal(18,6)',
      Percent: 'float',
      Check: 'integer(1)',
      SmallText: 'text',
      LongText: 'text',
      Code: 'text',
      TextEditor: 'text',
      Date: 'date',
      Datetime: 'datetime',
      Time: 'time',
      Text: 'text',
      Data: 'string(140)',
      Link: ' string(140)',
      DynamicLink: 'text',
      Password: 'string(140)',
      Select: 'string(140)',
      ReadOnly: 'string(140)',
      File: 'text',
      Attach: 'text',
      AttachImage: 'text',
      Signature: 'text',
      Color: 'text',
      Barcode: 'text',
      Geolocation: 'text'
    };
  }
};
