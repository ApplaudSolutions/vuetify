import '../../stylus/components/_data-table.styl'

// Components
import { VDataHeader, VRowFunctional, VRowGroup, VDataHeaderMobile, VCellCheckbox } from '.'
import { VDataIterator } from '../VDataIterator'
import { VBtn } from '../VBtn'
import { VIcon } from '../VIcon'

// Utils
import { getObjectValueByPath, wrapInArray, groupByProperty, convertToUnit } from '../../util/helpers'

// Types
import { VNodeChildrenArrayContents, VNode } from 'vue'
import { PropValidator } from 'vue/types/options'
import mixins from '../../util/mixins'
import TableHeader from './TableHeader'

// Helpers
import { defaultSort } from './helpers'

export default mixins(VDataIterator).extend({
  name: 'v-data-table',

  inheritAttrs: false,

  provide (): any {
    return { dataTable: this }
  },

  props: {
    customSort: {
      type: Function,
      default: defaultSort
    },
    dense: Boolean,
    groupBy: String,
    headers: {
      type: Array,
      default: () => ([])
    } as PropValidator<TableHeader[]>,
    height: String,
    hideDefaultHeader: Boolean,
    loading: Boolean,
    showSelect: Boolean,
    static: Boolean,
    calculateWidths: Boolean,
    caption: String,
    showExpand: Boolean
  },

  data () {
    return {
      openCache: {} as { [key: string]: boolean },
      widths: [] as number[],
      options: {
        sortBy: wrapInArray(this.sortBy) as string[],
        sortDesc: wrapInArray(this.sortDesc) as boolean[],
        itemsPerPage: this.itemsPerPage,
        page: this.page,
        groupBy: this.groupBy
      } // TODO: Better way than to reproduce this whole object?
    }
  },

  computed: {
    headersWithCustomSort (): Record<string, TableHeader> {
      const headers: Record<string, TableHeader> = {}
      for (let i = 0; i < this.headers.length; i++) {
        const header = this.headers[i]
        if (header.sort) headers[header.value] = header
      }
      return headers
    },
    computedHeaders (): TableHeader[] {
      const headers = this.headers.filter(h => h.value === undefined || h.value !== this.options.groupBy)

      this.showSelect && headers.unshift({ text: '', value: 'dataTableSelect', sortable: false, width: '1px' })
      this.showExpand && headers.unshift({ text: '', value: 'dataTableExpand', sortable: false, width: '1px' })

      return headers
    },
    headersLength () {
      return this.computedHeaders.length
    },
    computedWidths (): (string | undefined)[] {
      return this.computedHeaders.map((h, i) => {
        return convertToUnit(h.width || this.widths[i])
      })
    },
    isMobile (): boolean {
      return !!this.$vuetify.breakpoint[this.mobileBreakpoint]
    }
  },

  created () {
    if (!this.sortBy || !this.sortBy.length) {
      const firstSortable = this.headers.find(h => !('sortable' in h) || !!h.sortable)
      if (firstSortable) this.options.sortBy = [firstSortable.value]
    }
  },

  mounted () {
    if (this.calculateWidths) {
      window.addEventListener('resize', this.calcWidths)
    }

    this.calcWidths()
  },

  beforeDestroy () {
    if (this.calculateWidths) {
      window.removeEventListener('resize', this.calcWidths)
    }
  },

  methods: {
    calcWidths () {
      const table = this.$refs.table as Element
      this.widths = Array.from(table.querySelectorAll('th')).map(e => e.clientWidth)
    },
    searchItems (items: any[]): any[] {
      // If we have column-specific filters, run them here
      // Right now an item has to pass all filters, this might not be ideal
      const filterableHeaders = this.headers.filter(h => !!h.filter)
      if (filterableHeaders.length) {
        items = items.filter(i => filterableHeaders.every(h => h.filter!(getObjectValueByPath(i, h.value), this.search, i)))
        this.searchItemsLength = items.length
      }

      items = VDataIterator.options.methods.searchItems.call(this, items)

      return items
    },
    sortItems (items: any[], sortBy: string[], sortDesc: boolean[], locale: string): any[] {
      sortBy = this.options.groupBy ? [this.options.groupBy, ...sortBy] : sortBy
      sortDesc = this.options.groupBy ? [false, ...sortDesc] : sortDesc

      return this.customSort(items, sortBy, sortDesc, locale, this.headersWithCustomSort)
    },
    createSlotProps () {
      return { items: this.computedItems, widths: this.widths }
    },
    genHeaders (): VNodeChildrenArrayContents {
      const headers = this.computeSlots('header')

      if (!this.hideDefaultHeader && !this.static) {
        headers.push(this.$createElement(this.isMobile ? VDataHeaderMobile : VDataHeader))
      }

      return headers
    },
    genItems (): VNode {
      const items: VNodeChildrenArrayContents[] = []

      this.options.groupBy
        ? items.push(this.genGroupedRows(this.computedItems, this.options.groupBy))
        : items.push(this.genRows(this.computedItems))

      return this.genBodyWrapper(items)
    },
    genDefaultRows (items: any[]): VNodeChildrenArrayContents {
      return this.$scopedSlots['item.expanded']
        ? items.map(item => this.genDefaultExpandedRow(item))
        : items.map(item => this.genDefaultSimpleRow(item))
    },
    genDefaultExpandedRow (item: any): VNode {
      const isExpanded = this.isExpanded(item)
      const headerRow = this.genDefaultSimpleRow(item, isExpanded ? 'expanded expanded__row' : null)
      const expandedRow = this.$createElement('tr', {
        staticClass: 'expanded expanded__content'
      }, [this.$scopedSlots['item.expanded']({ item, headers: this.computedHeaders })])

      return this.$createElement(VRowGroup, {
        props: {
          open: isExpanded
        }
      }, [
        this.$createElement('template', { slot: 'headerRow' }, [headerRow]),
        this.$createElement('template', { slot: 'content' }, [expandedRow])
      ])
    },
    genDefaultSimpleRow (item: any, classes: string | string[] | object | null = null): VNode {
      const scopedSlots: any = Object.keys(this.$scopedSlots).filter(k => k.startsWith('item.column.')).reduce((obj: any, k: string) => {
        obj[k.replace('item.column.', '')] = this.$scopedSlots[k]
        return obj
      }, {})

      if (this.showSelect) {
        scopedSlots['dataTableSelect'] = (props: any) => this.$createElement(VCellCheckbox, {
          props: {
            inputValue: this.isSelected(item)
          },
          on: {
            change: (v: any) => this.select(item, v)
          }
        })
      }

      const expanded = this.isExpanded(item)

      if (this.showExpand) {
        scopedSlots['dataTableExpand'] = (props: any) => this.$createElement(VIcon, {
          staticClass: 'expand__icon',
          class: {
            'expand__icon--active': expanded
          },
          on: {
            click: () => this.expand(item, !expanded)
          }
        }, [this.$vuetify.icons.expand]) // TODO: prop?
      }

      return this.$createElement(VRowFunctional, {
        class: classes,
        props: {
          headers: this.computedHeaders,
          item,
          mobile: this.isMobile
        },
        scopedSlots
      })
    },
    genScopedRows (items: any[]): VNodeChildrenArrayContents {
      return items.map((item: any, i: number) => {
        const props = this.createItemProps(item)
        props.headers = this.computedHeaders
        return this.$scopedSlots.item(props)
      })
    },
    genRows (items: any[]): VNodeChildrenArrayContents {
      return this.$scopedSlots.item ? this.genScopedRows(items) : this.genDefaultRows(items)
    },
    genDefaultGroupedRow (groupBy: string, group: string, items: any[]) {
      const open = !!this.openCache[group]
      const children: VNodeChildrenArrayContents = [
        this.$createElement('template', { slot: 'content' }, this.genDefaultRows(items))
      ]

      if (this.$scopedSlots['group.header']) {
        children.unshift(this.$createElement('template', { slot: 'headerColumn' }, [
          this.$scopedSlots['group.header']({ group, groupBy, items, headers: this.computedHeaders })
        ]))
      } else {
        const toggle = this.$createElement(VBtn, {
          staticClass: 'ma-0',
          props: {
            icon: true,
            small: true
          },
          on: {
            click: () => this.$set(this.openCache, group, !this.openCache[group])
          }
        }, [this.$createElement(VIcon, [open ? 'remove' : 'add'])])

        const remove = this.$createElement(VBtn, {
          staticClass: 'ma-0',
          props: {
            icon: true,
            small: true
          },
          on: {
            click: () => this.options.groupBy = ''
          }
        }, [this.$createElement(VIcon, ['close'])])

        const column = this.$createElement('td', {
          staticClass: 'text-xs-left',
          attrs: {
            colspan: this.headersLength
          }
        }, [toggle, `${groupBy}: ${group}`, remove])

        children.unshift(this.$createElement('template', { slot: 'headerColumn' }, [column]))
      }

      if (this.$scopedSlots['group.summary']) {
        children.push(this.$createElement('template', { slot: 'summaryColumn' }, [
          this.$scopedSlots['group.summary']({ group, groupBy, items, headers: this.computedHeaders })
        ]))
      }
      console.log(children)
      return this.$createElement(VRowGroup, {
        props: {
          open
        }
      }, children)
    },
    genGroupedRows (items: any[], groupBy: string): VNodeChildrenArrayContents {
      const grouped = groupByProperty(items, groupBy)
      const groups = Object.keys(grouped)

      // TODO: Better way to do this? Sorting on group
      const i = this.options.sortBy.findIndex((v: string) => v === groupBy)
      if (i > -1 && this.options.sortDesc[i]) {
        groups.reverse()
      }

      const rows: VNodeChildrenArrayContents = []
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i]

        if (!this.openCache.hasOwnProperty(group)) this.$set(this.openCache, group, true)

        if (this.$scopedSlots.group) {
          rows.push(this.$scopedSlots.group({
            groupBy,
            group,
            items: grouped[group],
            headers: this.computedHeaders
          }))
        } else {
          rows.push(this.genDefaultGroupedRow(groupBy, group, grouped[group]))
        }
      }

      return rows
    },
    genBodies () {
      if (this.static) return this.$slots.default
      else return VDataIterator.options.methods.genBodies.call(this)
    },
    genBodyWrapper (items: any[]) {
      return this.$createElement('tbody', {
        staticClass: 'v-data-table__body'
      }, items)
    },
    genEmpty (content: VNodeChildrenArrayContents) {
      return this.$createElement('tr', [this.$createElement('td', { attrs: { colspan: this.headersLength } }, content)])
    },
    genColGroup () {
      const cols = this.computedHeaders.map((h, i) => this.$createElement('col', {
        class: {
          'divider': h.divider || h.resizable,
          'resizable': h.resizable
        },
        style: {
          width: this.computedWidths[i]
        }
      }))

      return this.$createElement('colgroup', cols)
    },
    genTable () {
      const children: VNodeChildrenArrayContents = [
        this.genColGroup(),
        ...this.genHeaders(),
        ...this.genBodies()
      ]

      this.caption && children.unshift(this.$createElement('caption', [this.caption]))

      return this.$createElement('div', {
        staticClass: 'v-data-table__wrapper',
        style: {
          height: this.height
        }
      }, [this.$createElement('table', { ref: 'table' }, children)])
    }
  },

  render (h): VNode {
    const children: VNodeChildrenArrayContents = [this.genTable()]

    if (!this.static) children.push(...this.computeSlots('footer'), ...this.genFooter())

    return h('div', {
      staticClass: 'v-data-table',
      class: {
        'v-data-table--dense': this.dense,
        'v-data-table--fixed': !!this.height,
        'v-data-table--mobile': this.isMobile,
        ...this.themeClasses
      }
    }, children)
  }
})