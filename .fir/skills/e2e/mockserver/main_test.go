// Tests for pure functions in the mock server.
package main

import (
	"encoding/json"
	"testing"
)

// --- lastUserText ---

func TestLastUserText(t *testing.T) {
	mustJSON := func(v any) json.RawMessage {
		b, _ := json.Marshal(v)
		return b
	}

	tests := []struct {
		name     string
		messages []chatMessage
		want     string
	}{
		{
			name:     "empty messages",
			messages: nil,
			want:     "",
		},
		{
			name: "single user string message",
			messages: []chatMessage{
				{Role: "user", Content: mustJSON("hello world")},
			},
			want: "hello world",
		},
		{
			name: "skips assistant messages",
			messages: []chatMessage{
				{Role: "user", Content: mustJSON("first")},
				{Role: "assistant", Content: mustJSON("reply")},
			},
			want: "first",
		},
		{
			name: "returns last user message",
			messages: []chatMessage{
				{Role: "user", Content: mustJSON("first")},
				{Role: "user", Content: mustJSON("second")},
			},
			want: "second",
		},
		{
			name: "user message with array content",
			messages: []chatMessage{
				{Role: "user", Content: mustJSON([]map[string]any{
					{"type": "text", "text": "array content"},
					{"type": "image", "text": "should be ignored"},
				})},
			},
			want: "array content",
		},
		{
			name: "no user message returns empty",
			messages: []chatMessage{
				{Role: "assistant", Content: mustJSON("reply")},
				{Role: "tool", Content: mustJSON("result")},
			},
			want: "",
		},
		{
			name: "tool message after user — returns user text",
			messages: []chatMessage{
				{Role: "user", Content: mustJSON("use the tool")},
				{Role: "tool", Content: mustJSON("result")},
			},
			want: "use the tool",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := lastUserText(tt.messages)
			if got != tt.want {
				t.Errorf("lastUserText() = %q, want %q", got, tt.want)
			}
		})
	}
}

// --- toolSet ---

func TestToolSet(t *testing.T) {
	tests := []struct {
		name  string
		tools []chatTool
		want  map[string]bool
	}{
		{
			name:  "empty",
			tools: nil,
			want:  map[string]bool{},
		},
		{
			name: "single tool",
			tools: []chatTool{
				{Type: "function", Function: toolFunc{Name: "read"}},
			},
			want: map[string]bool{"read": true},
		},
		{
			name: "multiple tools",
			tools: []chatTool{
				{Type: "function", Function: toolFunc{Name: "read"}},
				{Type: "function", Function: toolFunc{Name: "write"}},
				{Type: "function", Function: toolFunc{Name: "bash"}},
			},
			want: map[string]bool{"read": true, "write": true, "bash": true},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := toolSet(tt.tools)
			if len(got) != len(tt.want) {
				t.Fatalf("toolSet() len = %d, want %d", len(got), len(tt.want))
			}
			for k, v := range tt.want {
				if got[k] != v {
					t.Errorf("toolSet()[%q] = %v, want %v", k, got[k], v)
				}
			}
		})
	}
}

// --- chunkString ---

func TestChunkString(t *testing.T) {
	tests := []struct {
		name  string
		s     string
		size  int
		want  []string
	}{
		{
			name:  "empty string",
			s:     "",
			size:  10,
			want:  nil,
		},
		{
			name:  "shorter than chunk size",
			s:     "hello",
			size:  10,
			want:  []string{"hello"},
		},
		{
			name:  "exact chunk size",
			s:     "hello",
			size:  5,
			want:  []string{"hello"},
		},
		{
			name:  "two chunks",
			s:     "hello world",
			size:  5,
			want:  []string{"hello", " worl", "d"},
		},
		{
			name:  "chunk size 1",
			s:     "abc",
			size:  1,
			want:  []string{"a", "b", "c"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := chunkString(tt.s, tt.size)
			if len(got) != len(tt.want) {
				t.Fatalf("chunkString(%q, %d) = %v, want %v", tt.s, tt.size, got, tt.want)
			}
			for i := range tt.want {
				if got[i] != tt.want[i] {
					t.Errorf("chunk[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

// --- sseChunk ---

func TestSseChunk(t *testing.T) {
	t.Run("text chunk produces valid JSON with content", func(t *testing.T) {
		raw := sseChunk("test-id", "hello", nil, nil)
		var resp sseResponse
		if err := json.Unmarshal([]byte(raw), &resp); err != nil {
			t.Fatalf("sseChunk() returned invalid JSON: %v\nraw: %s", err, raw)
		}
		if resp.ID != "test-id" {
			t.Errorf("ID = %q, want %q", resp.ID, "test-id")
		}
		if len(resp.Choices) != 1 {
			t.Fatalf("len(Choices) = %d, want 1", len(resp.Choices))
		}
		if resp.Choices[0].Delta.Content == nil || *resp.Choices[0].Delta.Content != "hello" {
			t.Errorf("Delta.Content = %v, want %q", resp.Choices[0].Delta.Content, "hello")
		}
		if resp.Choices[0].FinishReason != nil {
			t.Errorf("FinishReason = %v, want nil", resp.Choices[0].FinishReason)
		}
	})

	t.Run("empty content produces no content field", func(t *testing.T) {
		raw := sseChunk("test-id", "", nil, nil)
		var resp sseResponse
		if err := json.Unmarshal([]byte(raw), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		if resp.Choices[0].Delta.Content != nil {
			t.Errorf("expected nil content, got %q", *resp.Choices[0].Delta.Content)
		}
	})

	t.Run("tool calls are included in delta", func(t *testing.T) {
		tc := toolCallDelta{Index: 0, ID: "call_1", Type: "function", Function: &toolCallFunc{Name: "read", Arguments: ""}}
		raw := sseChunk("test-id", "", nil, []toolCallDelta{tc})
		var resp sseResponse
		if err := json.Unmarshal([]byte(raw), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		if len(resp.Choices[0].Delta.ToolCalls) != 1 {
			t.Fatalf("expected 1 tool call, got %d", len(resp.Choices[0].Delta.ToolCalls))
		}
		if resp.Choices[0].Delta.ToolCalls[0].ID != "call_1" {
			t.Errorf("ToolCall ID = %q, want %q", resp.Choices[0].Delta.ToolCalls[0].ID, "call_1")
		}
	})
}

// --- sseChunkFinal ---

func TestSseChunkFinal(t *testing.T) {
	t.Run("stop reason with usage", func(t *testing.T) {
		reason := "stop"
		raw := sseChunkFinal("final-id", &reason)
		var resp sseResponse
		if err := json.Unmarshal([]byte(raw), &resp); err != nil {
			t.Fatalf("invalid JSON: %v\nraw: %s", err, raw)
		}
		if resp.ID != "final-id" {
			t.Errorf("ID = %q, want %q", resp.ID, "final-id")
		}
		if len(resp.Choices) != 1 {
			t.Fatalf("len(Choices) = %d, want 1", len(resp.Choices))
		}
		if resp.Choices[0].FinishReason == nil || *resp.Choices[0].FinishReason != "stop" {
			t.Errorf("FinishReason = %v, want %q", resp.Choices[0].FinishReason, "stop")
		}
		if resp.Usage == nil {
			t.Fatal("expected Usage, got nil")
		}
		if resp.Usage.TotalTokens != 70 {
			t.Errorf("TotalTokens = %d, want 70", resp.Usage.TotalTokens)
		}
	})

	t.Run("tool_calls finish reason", func(t *testing.T) {
		reason := "tool_calls"
		raw := sseChunkFinal("tc-id", &reason)
		var resp sseResponse
		if err := json.Unmarshal([]byte(raw), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		if resp.Choices[0].FinishReason == nil || *resp.Choices[0].FinishReason != "tool_calls" {
			t.Errorf("FinishReason = %v, want %q", resp.Choices[0].FinishReason, "tool_calls")
		}
	})
}
