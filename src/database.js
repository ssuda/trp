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
      connection: {
        connectionString: options.connection.replace('?ssl=true', ''),
        ssl: {
          ca: [
            `-----BEGIN CERTIFICATE-----
MIIEBjCCAu6gAwIBAgIJAMc0ZzaSUK51MA0GCSqGSIb3DQEBCwUAMIGPMQswCQYD
VQQGEwJVUzEQMA4GA1UEBwwHU2VhdHRsZTETMBEGA1UECAwKV2FzaGluZ3RvbjEi
MCAGA1UECgwZQW1hem9uIFdlYiBTZXJ2aWNlcywgSW5jLjETMBEGA1UECwwKQW1h
em9uIFJEUzEgMB4GA1UEAwwXQW1hem9uIFJEUyBSb290IDIwMTkgQ0EwHhcNMTkw
ODIyMTcwODUwWhcNMjQwODIyMTcwODUwWjCBjzELMAkGA1UEBhMCVVMxEDAOBgNV
BAcMB1NlYXR0bGUxEzARBgNVBAgMCldhc2hpbmd0b24xIjAgBgNVBAoMGUFtYXpv
biBXZWIgU2VydmljZXMsIEluYy4xEzARBgNVBAsMCkFtYXpvbiBSRFMxIDAeBgNV
BAMMF0FtYXpvbiBSRFMgUm9vdCAyMDE5IENBMIIBIjANBgkqhkiG9w0BAQEFAAOC
AQ8AMIIBCgKCAQEArXnF/E6/Qh+ku3hQTSKPMhQQlCpoWvnIthzX6MK3p5a0eXKZ
oWIjYcNNG6UwJjp4fUXl6glp53Jobn+tWNX88dNH2n8DVbppSwScVE2LpuL+94vY
0EYE/XxN7svKea8YvlrqkUBKyxLxTjh+U/KrGOaHxz9v0l6ZNlDbuaZw3qIWdD/I
6aNbGeRUVtpM6P+bWIoxVl/caQylQS6CEYUk+CpVyJSkopwJlzXT07tMoDL5WgX9
O08KVgDNz9qP/IGtAcRduRcNioH3E9v981QO1zt/Gpb2f8NqAjUUCUZzOnij6mx9
McZ+9cWX88CRzR0vQODWuZscgI08NvM69Fn2SQIDAQABo2MwYTAOBgNVHQ8BAf8E
BAMCAQYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUc19g2LzLA5j0Kxc0LjZa
pmD/vB8wHwYDVR0jBBgwFoAUc19g2LzLA5j0Kxc0LjZapmD/vB8wDQYJKoZIhvcN
AQELBQADggEBAHAG7WTmyjzPRIM85rVj+fWHsLIvqpw6DObIjMWokpliCeMINZFV
ynfgBKsf1ExwbvJNzYFXW6dihnguDG9VMPpi2up/ctQTN8tm9nDKOy08uNZoofMc
NUZxKCEkVKZv+IL4oHoeayt8egtv3ujJM6V14AstMQ6SwvwvA93EP/Ug2e4WAXHu
cbI1NAbUgVDqp+DRdfvZkgYKryjTWd/0+1fS8X1bBZVWzl7eirNVnHbSH2ZDpNuY
0SBd8dj5F6ld3t58ydZbrTHze7JJOd8ijySAp4/kiu9UfZWuTPABzDa/DSdz9Dk/
zPW4CXXvhLmE02TA9/HeCw3KEHIwicNuEfw=
-----END CERTIFICATE-----`
          ]
        }
      },
      pool: {
        afterCreate(conn, callback) {
          conn.on('error', console.error.bind(console));
          callback(null, conn);
        },
        min: 0,
        max: 7
      },
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
    await this.run(`ALTER TABLE "${doctype}" DROP COLUMN IF EXISTS ${column}`);
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
