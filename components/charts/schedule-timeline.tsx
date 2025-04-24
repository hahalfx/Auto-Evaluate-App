"use client"

import { useState } from "react"
import { useScheduleStore } from "@/lib/services/schedule-service"
import { CATEGORY_COLORS, type ScheduleEvent } from "@/lib/types/schedule"
import { Button } from "@/components/ui/button"
import { PlusCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScheduleForm } from "../schedule/schedule-form"
import { ScheduleDetail } from "../schedule/schedule-detail"
import { ScheduleFilters } from "../schedule/schedule-filters"

export function ScheduleTimeline() {
  const { getFilteredEvents } = useScheduleStore()
  const [isAddEventOpen, setIsAddEventOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const events = getFilteredEvents()
  const hours = Array.from({ length: 12 }, (_, i) => `${i + 8}:00`)

  const handleAddEvent = () => {
    setIsAddEventOpen(true)
  }

  const handleEventClick = (event: ScheduleEvent) => {
    setSelectedEvent(event)
    setIsDetailOpen(true)
  }

  const handleEditEvent = () => {
    setIsDetailOpen(false)
    setIsEditOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">日程安排</h3>
        <div className="flex items-center space-x-2">
          <ScheduleFilters />
          <Button size="sm" onClick={handleAddEvent}>
            <PlusCircle className="mr-1 h-4 w-4" />
            添加
          </Button>
        </div>
      </div>

      <div className="relative h-[400px] w-full overflow-auto">
        {/* 时间线 */}
        <div className="absolute left-16 right-0 top-6 h-px bg-border"></div>
        <div className="flex h-full flex-col">
          {/* 时间标记 */}
          <div className="flex pl-16">
            {hours.map((hour) => (
              <div key={hour} className="relative flex-1 text-center">
                <div className="absolute -top-6 left-0 right-0">
                  <span className="text-xs text-muted-foreground">{hour}</span>
                </div>
                <div className="absolute -top-3 left-1/2 h-2 w-px bg-border"></div>
              </div>
            ))}
          </div>

          {/* 事件 */}
          <div className="mt-8 space-y-4 pl-0">
            {events.length === 0 ? (
              <div className="flex h-32 items-center justify-center">
                <p className="text-sm text-muted-foreground">当前日期没有日程安排</p>
              </div>
            ) : (
              events.map((event) => {
                // 计算位置和宽度
                const startHour = Number.parseInt(event.startTime.split(":")[0])
                const endHour = Number.parseInt(event.endTime.split(":")[0])
                const startMinute = Number.parseInt(event.startTime.split(":")[1])
                const endMinute = Number.parseInt(event.endTime.split(":")[1])

                const start = (startHour - 8) * 60 + startMinute
                const end = (endHour - 8) * 60 + endMinute
                const duration = end - start

                const left = `${(start / 720) * 100}%`
                const width = `${(duration / 720) * 100}%`
                const categoryColor = CATEGORY_COLORS[event.category]

                return (
                  <div key={event.id} className="relative flex h-12 items-center">
                    <div className="w-16 pr-4 text-right">
                      <span className="text-xs font-medium truncate">{event.title}</span>
                    </div>
                    <div
                      className={`absolute h-8 rounded-md border ${categoryColor.bg} ${categoryColor.text} ${categoryColor.border} flex items-center px-2 text-xs cursor-pointer transition-all hover:shadow-md`}
                      style={{ left, width, minWidth: "80px" }}
                      onClick={() => handleEventClick(event)}
                    >
                      <div className="truncate">
                        {event.startTime} - {event.endTime}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* 添加日程对话框 */}
      <Dialog open={isAddEventOpen} onOpenChange={setIsAddEventOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>添加新日程</DialogTitle>
          </DialogHeader>
          <ScheduleForm onClose={() => setIsAddEventOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* 日程详情对话框 */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>日程详情</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <ScheduleDetail event={selectedEvent} onEdit={handleEditEvent} onClose={() => setIsDetailOpen(false)} />
          )}
        </DialogContent>
      </Dialog>

      {/* 编辑日程对话框 */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>编辑日程</DialogTitle>
          </DialogHeader>
          {selectedEvent && <ScheduleForm event={selectedEvent} onClose={() => setIsEditOpen(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
