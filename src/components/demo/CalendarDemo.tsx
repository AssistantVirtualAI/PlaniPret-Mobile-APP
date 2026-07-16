import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const timeSlots = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
];

const days = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

export const CalendarDemo = () => {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isBooked, setIsBooked] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  // Generate random availability
  const getAvailability = (dayIndex: number, time: string) => {
    const seed = dayIndex * 100 + parseInt(time.replace(":", ""));
    return seed % 3 !== 0; // ~66% availability
  };

  const handleBook = async () => {
    if (!selectedDay || !selectedTime) return;
    setIsBooking(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsBooked(true);
    setIsBooking(false);
    toast.success("Rendez-vous confirmé !");
  };

  const handleReset = () => {
    setSelectedDay(null);
    setSelectedTime(null);
    setIsBooked(false);
    setWeekOffset(0);
  };

  const getDateForDay = (dayIndex: number) => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + dayIndex);
    return date.getDate();
  };

  const getMonthYear = () => {
    const today = new Date();
    today.setDate(today.getDate() + weekOffset * 7);
    return today.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  };

  if (isBooked) {
    return (
      <Card className="h-[400px] flex flex-col">
        <CardContent className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h3 className="text-xl font-bold mb-2">Rendez-vous Confirmé !</h3>
          <p className="text-muted-foreground mb-4">
            {days[selectedDay!]} à {selectedTime}
          </p>
          <div className="flex items-center gap-2 mb-6">
            <Badge>Email de confirmation envoyé</Badge>
          </div>
          <Button onClick={handleReset} variant="outline">
            Réserver un autre créneau
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Prise de Rendez-vous
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setWeekOffset((prev) => prev - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground capitalize min-w-[120px] text-center">
              {getMonthYear()}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setWeekOffset((prev) => prev + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 overflow-auto">
        {/* Day Selection */}
        <div className="grid grid-cols-5 gap-2">
          {days.map((day, index) => (
            <Button
              key={day}
              variant={selectedDay === index ? "default" : "outline"}
              className="flex flex-col h-auto py-2"
              onClick={() => {
                setSelectedDay(index);
                setSelectedTime(null);
              }}
            >
              <span className="text-xs opacity-70">{day}</span>
              <span className="text-lg font-bold">{getDateForDay(index)}</span>
            </Button>
          ))}
        </div>

        {/* Time Slots */}
        {selectedDay !== null && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              Créneaux disponibles
            </div>
            <div className="grid grid-cols-4 gap-2">
              {timeSlots.map((time) => {
                const isAvailable = getAvailability(selectedDay, time);
                return (
                  <Button
                    key={time}
                    variant={selectedTime === time ? "default" : "outline"}
                    size="sm"
                    disabled={!isAvailable}
                    onClick={() => setSelectedTime(time)}
                    className={!isAvailable ? "opacity-30" : ""}
                  >
                    {time}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Book Button */}
        <Button
          className="w-full gap-2"
          onClick={handleBook}
          disabled={!selectedDay || !selectedTime || isBooking}
        >
          <Calendar className="w-4 h-4" />
          {isBooking
            ? "Réservation en cours..."
            : selectedTime
            ? `Réserver ${days[selectedDay!]} à ${selectedTime}`
            : "Sélectionnez un créneau"}
        </Button>
      </CardContent>
    </Card>
  );
};
