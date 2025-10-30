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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <MessageCircle className="w-5 h-5 text-blue-600" />
            <span>Contact Support</span>
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Subject</label>
            <Input
              value={formData.subject}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="Brief description of your issue"
              maxLength={100}
              disabled={submitMessageMutation.isPending}
              data-testid="input-support-subject"
            />
            <p className="text-xs text-muted-foreground">
              {formData.subject.length}/100 characters
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Message</label>
            <Textarea
              value={formData.message}
              onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
              placeholder="Please describe your issue in detail. Include any error messages, steps you took, and what you expected to happen."
              rows={6}
              maxLength={1000}
              disabled={submitMessageMutation.isPending}
              data-testid="textarea-support-message"
            />
            <p className="text-xs text-muted-foreground">
              {formData.message.length}/1000 characters
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center space-x-2 text-sm">
              <MessageCircle className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-800 dark:text-blue-200">Need Immediate Help?</span>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
              For urgent issues, call: <span className="font-mono font-medium">(469) 269-6709</span>
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitMessageMutation.isPending}
              data-testid="button-cancel-support"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitMessageMutation.isPending || !formData.subject.trim() || !formData.message.trim()}
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