'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DateTimePickerProps {
  date: Date;
  time: string;
  onDateChange: (date: Date | undefined) => void;
  onTimeChange: (time: string) => void;
  className?: string;
}

export function DateTimePicker({ date, time, onDateChange, onTimeChange, className }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className ?? 'flex gap-2'}>
      <div className="flex-1 space-y-2">
        <Label htmlFor="date-picker">Tanggal</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                id="date-picker"
                className="w-full justify-between font-normal"
              />
            }
          >
            {format(date, 'd MMM yyyy', { locale: idLocale })}
            <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              locale={idLocale}
              selected={date}
              captionLayout="dropdown"
              defaultMonth={date}
              onSelect={(d) => {
                onDateChange(d);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="w-28 space-y-2">
        <Label htmlFor="time-picker">Jam</Label>
        <Input
          type="time"
          id="time-picker"
          value={time}
          onChange={(e) => onTimeChange(e.target.value)}
          className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        />
      </div>
    </div>
  );
}
