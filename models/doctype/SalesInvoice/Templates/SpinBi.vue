<template>
  <div class="border h-full">
    <div>
      <div class="px-6 pt-6" v-if="printSettings && accountingSettings">
        <div class="flex text-sm text-gray-900 pb-4">
          <div class="w-1/3">
            <div v-if="printSettings.displayLogo">
              <img
                class="h-12 max-w-32 object-contain"
                :src="printSettings.logo"
              />
            </div>
          </div>
          <div class="w-1/3 text-center">
            <div class="text-lg font-semibold">TAX INVOICE</div>
          </div>
          <div class="w-1/3 " >
            <div class="text-center px-16">
              <div class="border-dashed border-2 border-gray-600 p-1">
              <div>ORIGINAL</div>
              <div class="border-t">For Recipient</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="px-6 py-3 text-lg border-b">
          <div class="flex py-1 text-gray-1000">
            <div class="w-5/12">
              <h1 class="text-xl font-semibold">
                M/s Orissa Bengal Transport company
              </h1>
              <div class="py-2 text-base">
              NEAR PRIMERY
              SCHOOL,SUNDARA BASTI,
              BARBIL ,
              KEONJHAR ,ODISHA ,758035,
              BARBIL, Orissa 758035
              9437139767
              obt.co@rediffmail.com
              </div>
            </div>
            <div class="w-4/12 text-right mx-1">
               <div class="py-1 text-lg">
                <div class="px-6 mt-2 flex">
                    <div class="w-64">
                      <div class="flex pl-2 justify-between py-1">
                        <div>GSTIN</div>
                        <div>21AABFO9781F1Z9</div>
                      </div>
                      <div
                        class="flex pl-2 justify-between py-1">
                        <div>State</div>
                        <div>21-Orissa</div>
                      </div>
                      <div class="flex pl-2 justify-between py-1">
                        <div>PAN</div>
                        <div>AABFO9781F</div>
                      </div>
                    </div>
                  </div>
              </div> 
            </div>
            <div class="w-4/12 text-right mx-1">
               <div class="py-1 text-lg">
                <div class="px-3 mt-2 flex">
                    <div class="w-64">
                      <div class="flex pl-2 justify-between py-1">
                        <div>Invoice Date</div>
                        <div>31/01/2020</div>
                      </div>
                      <div
                        class="flex pl-2 justify-between py-1">
                        <div>Invoice No.</div>
                        <div>OBT/RAK19-20</div>
                      </div>
                      <div class="flex pl-2 justify-between py-1">
                        <div>Reference No.</div>
                        <div></div>
                      </div>
                    </div>
                  </div>
              </div>
            </div>
          </div>
      </div>
      <div class="px-6 py-3 text-lg border-b">
        <div class="flex py-1 text-gray-1000">
          <div class="w-4/12">
            <h1 class="text-md font-semibold">
              Customer Name
            </h1>
            <div class="py-2 text-bold ">
            NORTH EASTERN CARRYING CORPORATION LTD.
            </div>
            <h1 class="text-md font-semibold pt-2">
              Customer GSTIN
            </h1>
            <div class="py-2 text-bold ">
              21AABCN5129K2ZM   
            </div>
          </div>
          <div class="w-4/12">
            <h1 class="text-md font-semibold">
              Billing Address
            </h1>
            <div class="py-2 text-base">
              NORTH EASTERN CARRYING
              CORPORATION LTD.
              MIRNAL COLONY,MIRNAL COLONY,JODA
              BARBIL,KEONDUJHAR , BARBIL
              Orissa, 758035
              India
            </div>
          </div>
          <div class="w-4/12">
            <h1 class="text-md font-semibold">
              Shipping Address
            </h1>
            <div class="py-2 text-base">
              NORTH EASTERN CARRYING
              CORPORATION LTD. MIRNAL COLONY,MIRNAL COLONY,JODA
              BARBIL,KEONDUJHAR , BARBIL
              Orissa, 758035
              India
              21AABCN5129K2ZM
            </div>
          </div>
        </div>
      </div>
      <div class="px-6 py-1 text-lg border-b">
        <div class="flex py-1 text-gray-1000">
          <div class="w-6/12">
            <div
              class="flex pl-2 py-1">
              <div>Place of Supply</div>
              <div class="mx-4">21-Orissa</div>
            </div>
          </div>
          <div class="w-6/12">
            <div
              class="flex pl-2 py-1">
              <div>Due Date</div>
              <div class="mx-4">31/03/2020</div>
            </div>
          </div>
        </div>
      </div>
      <table class="table-fixed px-6">
        <thead>
          <tr>
            <th class="border w-4/12 px-2 py-2 text-sm">Item</th>
            <th class="border w-2/12 px-2 py-2 text-sm">HSN/ SAC</th>
            <th class="border w-2/12 px-2 py-2 text-sm">Qty</th>
            <th class="border w-2/12 px-2 py-2 text-sm">Rate</th>
            <th class="border w-1/12 px-2 py-2 text-sm">Disc.</th>
            <th class="border w-2/12 px-2 py-2 text-sm">Taxable Value</th>
            <th class="border w-2/12 px-2 py-2 text-sm">CGST</th>
            <th class="border w-2/12 px-2 py-2 text-sm">SGST</th>
            <th class="border w-1/12 px-2 py-2 text-sm">CESS</th>
            <th class="border w-3/12 px-2 py-2 text-sm">Total (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="border px-1 py-2 text-sm">Transport Services</td>
            <td class="border px-1 py-2 text-sm">9967</td>
            <td class="border px-1 py-2 text-sm">14,654.59</td>
            <td class="border px-1 py-2 text-sm">26.50</td>
            <td class="border px-1 py-2 text-sm">0.00</td>
            <td class="border px-1 py-2 text-sm">3,88,346.64</td>
            <td class="border px-1 py-2 text-sm">34,951.20</td>
            <td class="border px-1 py-2 text-sm">34,951.20</td>
            <td class="border px-1 py-2 text-sm">0.00</td>
            <td class="border px-1 py-2 text-sm">4,58,249.04</td>
          </tr>
          <tr>
            <td class="border px-1 py-2 text-sm">Transport Services</td>
            <td class="border px-1 py-2 text-sm">9967</td>
            <td class="border px-1 py-2 text-sm">14,654.59</td>
            <td class="border px-1 py-2 text-sm">26.50</td>
            <td class="border px-1 py-2 text-sm">0.00</td>
            <td class="border px-1 py-2 text-sm">3,88,346.64</td>
            <td class="border px-1 py-2 text-sm">34,951.20</td>
            <td class="border px-1 py-2 text-sm">34,951.20</td>
            <td class="border px-1 py-2 text-sm">0.00</td>
            <td class="border px-1 py-2 text-sm">4,58,249.04</td>
          </tr>
          <tr>
            <td class="border-b px-1 py-2"></td>
            <td class="border-b px-1 py-2"></td>
            <td class="border-b px-1 py-2"></td>
            <td class="border-b px-1 py-2 text-bold text-sm">Total</td>
            <td class="border-b px-1 py-2"></td>
            <td class="border px-1 py-2 text-bold text-sm">17,24,925.82</td>
            <td class="border px-1 py-2 text-bold text-sm">1,55,243.33</td>
            <td class="border px-1 py-2 text-bold text-sm">1,55,243.33</td>
            <td class="border px-1 py-2 text-bold text-sm">0.00</td>
            <td class="border px-1 py-2 text-bold text-sm">20,35,412.48</td>
          </tr> 
        </tbody>
      </table>
      <div class="px-6 mt-2 flex justify-end text-base">
        <div class="w-64">
          <div class="flex pl-2 justify-between py-1">
            <div>Taxable Amount</div>
            <div>17,24,925.82</div>
          </div>
          <div class="flex pl-2 justify-between py-1">
            <div>Total Tax</div>
            <div>3,10,486.66</div>
          </div>
          <div class="flex pl-2 justify-between py-1">
            <div>Rounding Off</div>
            <div>(0.48)</div>
          </div>
          <div
            class="flex pl-2 justify-between py-1 text-xl font-semibold text-base"
          >
            <div>Total Value</div>
            <div>20,35,412.00</div>
          </div>
        </div>
    </div>
     <div class="px-6 py-1 text-lg">
        <div class="flex py-1 text-gray-1000">
          <div class="w-full">
            <div class="py-1 text-lg">
                <div class="px-3 mt-2 flex">
                      <div class="flex pl-2 py-1">
                        <div class="text-left pr-10 pl-20 text-sm">Total Amount(In Words)</div>
                        <div class="text-right text-sm">Twenty Lakh Thirty Five Thousand Four Hundred Twelve Rupees Only</div>
                      </div>
                    </div>
                  </div>
              </div>
          </div>
        </div>
      </div>
       <div class="flex pb-10">
      <div class="w-3/5 border-solid border-2 ml-2">
        <div class="text-lg px-5 pb-1">
          Bank Details
        </div>
        <div class="px-3 flex text-sm p-5">
          <div class="w-64">
            <div class="flex pl-2 py-1">
              <div class="pr-5">Account Number:</div>
              <div>259437139767</div>
            </div>
            <div class="flex pl-2 py-1">
              <div class="pr-5">Bank Name:</div>
              <div>INDUSIND BANK LTD.</div>
            </div>
          </div>
          <div class="w-64">
            <div class="flex pl-2 py-1  ">
              <div class="pr-5">IFSC :</div>
              <div>INDB0000191</div>
            </div>
            <div class="flex pl-2 py-1">
              <div class="pr-5">Branch Name:</div>
              <div>BARBIL</div>
            </div>
          </div>
        </div>
      </div>
      <div class="w-4/12 text-sm">
        <div class="text-right pt-5">
          For M/s Orissa Bengal Transport company
        </div>
        <div class="text-right pt-10">
          Authorised Signatory
        </div>
      </div>
    </div>

      </div>
</template>

<script>
import frappe from 'frappejs';
import Row from '@/components/Row';

export default {
  name: 'Default',
  props: ['doc', 'printSettings'],
  components: {
    Row
  },
  data() {
    return {
      accountingSettings: null
    };
  },
  computed: {
    meta() {
      return this.doc && this.doc.meta;
    },
    address() {
      return this.printSettings && this.printSettings.getLink('address');
    },
    partyDoc() {
      return this.doc.getLink(this.partyField.fieldname);
    },
    partyField() {
      let fieldname = {
        SalesInvoice: 'customer',
        PurchaseInvoice: 'supplier'
      }[this.doc.doctype];
      return this.meta.getField(fieldname);
    },
    itemFields() {
      let itemsMeta = frappe.getMeta(`${this.doc.doctype}Item`);
      return ['item', 'quantity', 'rate', 'amount'].map(fieldname =>
        itemsMeta.getField(fieldname)
      );
    },
    ratio() {
      return [0.3].concat(this.itemFields.map(() => 1));
    }
  },
  methods: {
    textAlign(df) {
      return ['Currency', 'Int', 'Float'].includes(df.fieldtype)
        ? 'text-right'
        : '';
    }
  },
  async mounted() {
    this.accountingSettings = await frappe.getSingle('AccountingSettings');
    await this.doc.loadLink(this.partyField.fieldname);
  }
};
</script>
