import { defineStore } from 'pinia'

export const useScheduleStore = defineStore('schedule', {
  state: () => ({
    visible: false
  }),

  actions: {
    open() {
      this.visible = true
    },
    close() {
      this.visible = false
    }
  }
})
