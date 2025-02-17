
import { useState, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Context {
  id: string;
  name: string;
  content: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function Index() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [selectedContext, setSelectedContext] = useState<string>("no-context");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "text/plain": [".txt"],
      "application/pdf": [".pdf"],
    },
    onDrop: async (acceptedFiles) => {
      try {
        for (const file of acceptedFiles) {
          const text = await file.text();
          const newContext: Context = {
            id: Date.now().toString(),
            name: file.name,
            content: text,
          };
          setContexts((prev) => [...prev, newContext]);
          console.log("Added context:", newContext);
        }
        toast({
          title: "Success",
          description: "Documents uploaded successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to upload documents",
          variant: "destructive",
        });
      }
    },
  });

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    if (!apiKey) {
      toast({
        title: "API Key Required",
        description: "Please enter your Google AI API key to continue",
        variant: "destructive",
      });
      return;
    }

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const maxRetries = 3;
    let retryCount = 0;

    const makeRequest = async () => {
      const context = contexts.find((ctx) => ctx.id === selectedContext);
      let prompt = input;
      
      if (context && selectedContext !== "no-context") {
        prompt = `You are a helpful assistant. Use ONLY the following context to answer the question. If the question cannot be answered using the context, say "I cannot answer this question based on the provided context."

Context:
${context.content}

Question: ${input}

Answer:`;
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }]
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          throw new Error("RATE_LIMIT");
        }
        throw new Error(errorData.error?.message || response.statusText);
      }

      return response.json();
    };

    try {
      let data;
      while (retryCount < maxRetries) {
        try {
          data = await makeRequest();
          break;
        } catch (error) {
          if (error instanceof Error && error.message === "RATE_LIMIT") {
            retryCount++;
            if (retryCount < maxRetries) {
              const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
              toast({
                title: "Rate limit reached",
                description: `Retrying in ${waitTime/1000} seconds... (Attempt ${retryCount}/${maxRetries})`,
              });
              await delay(waitTime);
              continue;
            }
          }
          throw error;
        }
      }

      if (!data) {
        throw new Error("Failed to get response after retries");
      }

      const text = data.candidates[0].content.parts[0].text;
      const assistantMessage: Message = {
        role: "assistant",
        content: text,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to get response";
      toast({
        title: "Error",
        description: errorMessage === "RATE_LIMIT" 
          ? "Rate limit exceeded. Please try again later." 
          : errorMessage,
        variant: "destructive",
      });
      console.error("API Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto grid gap-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 col-span-1 backdrop-blur-lg bg-white/80 border border-gray-200">
            <h2 className="text-lg font-semibold mb-4">Settings</h2>
            <div className="mb-4">
              <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
                Google AI API Key
              </label>
              <input
                type="password"
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="w-full p-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <h2 className="text-lg font-semibold mb-4">Document Context</h2>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 mb-4 transition-colors ${
                isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
              }`}
            >
              <input {...getInputProps()} />
              <p className="text-center text-gray-600">
                {isDragActive
                  ? "Drop files here"
                  : "Drag & drop files here, or click to select"}
              </p>
            </div>
            <Select value={selectedContext} onValueChange={setSelectedContext}>
              <SelectTrigger>
                <SelectValue placeholder="Select context" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no-context">No context</SelectItem>
                {contexts.map((context) => (
                  <SelectItem key={context.id} value={context.id}>
                    {context.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>

          <Card className="p-6 col-span-1 md:col-span-2 backdrop-blur-lg bg-white/80 border border-gray-200">
            <div className="flex flex-col h-[600px]">
              <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] p-4 rounded-lg ${
                        message.role === "user"
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] p-4 rounded-lg bg-gray-100">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Type your message..."
                  className="flex-1 p-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button onClick={handleSend} disabled={isLoading}>
                  Send
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
