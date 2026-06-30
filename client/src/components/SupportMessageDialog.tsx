import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MessageCircle, Send } from "lucide-react";

interface SupportMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SupportMessageDialog({ isOpen, onClose }: SupportMessageDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    subject: "",
    message: "",
  });

  const submitMessageMutation = useMutation({
    mutationFn: async (data: { subject: string; message: string }) => {
      const response = await apiRequest("POST", "/api/messages", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Message Sent",
        description: "Your support message has been sent successfully. We'll get back to you soon!",
      });
      // Reset form
      setFormData({ subject: "", message: "" });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send Message",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.subject.trim()) {
      toast({
        title: "Subject Required",
        description: "Please enter a subject for your message.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.message.trim()) {
      toast({
        title: "Message Required",
        description: "Please enter your message.",
        variant: "destructive",
      });
      return;
    }

    submitMessageMutation.mutate(formData);
  };

  const handleClose = () => {
    if (!submitMessageMutation.isPending) {
      setFormData({ subject: "", message: "" });
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md border-slate-800 bg-slate-950 text-slate-100 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-slate-100">
            <MessageCircle className="w-5 h-5 text-sky-400" />
            <span>Contact Support</span>
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200">Subject</label>
            <Input
              value={formData.subject}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="Brief description of your issue"
              maxLength={100}
              disabled={submitMessageMutation.isPending}
              className="border-slate-700 bg-slate-900/80 text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-500/60"
              data-testid="input-support-subject"
            />
            <p className="text-xs text-slate-400">
              {formData.subject.length}/100 characters
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200">Message</label>
            <Textarea
              value={formData.message}
              onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
              placeholder="Please describe your issue in detail. Include any error messages, steps you took, and what you expected to happen."
              rows={6}
              maxLength={1000}
              disabled={submitMessageMutation.isPending}
              className="border-slate-700 bg-slate-900/80 text-slate-100 placeholder:text-slate-400 focus-visible:ring-sky-500/60"
              data-testid="textarea-support-message"
            />
            <p className="text-xs text-slate-400">
              {formData.message.length}/1000 characters
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <div className="flex items-center space-x-2 text-sm">
              <MessageCircle className="w-4 h-4 text-sky-400" />
              <span className="font-medium text-slate-100">Need Immediate Help?</span>
            </div>
            <p className="mt-1 text-xs text-sky-300">
              For urgent issues, call: <span className="font-mono font-medium">(469) 269-6709</span>
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitMessageMutation.isPending}
              className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-slate-100"
              data-testid="button-cancel-support"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitMessageMutation.isPending || !formData.subject.trim() || !formData.message.trim()}
              className="bg-sky-600 text-white hover:bg-sky-500"
              data-testid="button-send-support"
            >
              {submitMessageMutation.isPending ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Message
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
