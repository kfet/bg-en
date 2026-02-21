// Tests for pure functions in the mock server.
package main

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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

// --- handleCompletions ---

// sseLines reads all SSE data lines from a response body and returns their values.
func sseLines(body string) []string {
	var lines []string
	sc := bufio.NewScanner(strings.NewReader(body))
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "data: ") {
			lines = append(lines, strings.TrimPrefix(line, "data: "))
		}
	}
	return lines
}

// collectSSEText decodes all SSE chunks and concatenates text content.
func collectSSEText(t *testing.T, body string) string {
	t.Helper()
	var out strings.Builder
	for _, raw := range sseLines(body) {
		if raw == "[DONE]" {
			break
		}
		var resp sseResponse
		if err := json.Unmarshal([]byte(raw), &resp); err != nil {
			t.Fatalf("invalid SSE chunk JSON %q: %v", raw, err)
		}
		if len(resp.Choices) > 0 && resp.Choices[0].Delta.Content != nil {
			out.WriteString(*resp.Choices[0].Delta.Content)
		}
	}
	return out.String()
}

// collectSSEToolCall decodes all SSE chunks and returns the first tool-call name + arguments.
func collectSSEToolCall(t *testing.T, body string) (name, args string) {
	t.Helper()
	for _, raw := range sseLines(body) {
		if raw == "[DONE]" {
			break
		}
		var resp sseResponse
		if err := json.Unmarshal([]byte(raw), &resp); err != nil {
			t.Fatalf("invalid SSE chunk JSON %q: %v", raw, err)
		}
		if len(resp.Choices) == 0 {
			continue
		}
		for _, tc := range resp.Choices[0].Delta.ToolCalls {
			if tc.Function != nil {
				if tc.Function.Name != "" {
					name = tc.Function.Name
				}
				if tc.Function.Arguments != "" {
					args = tc.Function.Arguments
				}
			}
		}
	}
	return name, args
}

func makeBody(t *testing.T, messages []chatMessage, tools []chatTool) *strings.Reader {
	t.Helper()
	b, err := json.Marshal(chatRequest{Messages: messages, Tools: tools})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return strings.NewReader(string(b))
}

func mustJSONMsg(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

func TestHandleCompletions(t *testing.T) {
	readTool := chatTool{Type: "function", Function: toolFunc{Name: "read"}}
	writeTool := chatTool{Type: "function", Function: toolFunc{Name: "write"}}
	bashTool := chatTool{Type: "function", Function: toolFunc{Name: "bash"}}

	t.Run("malformed JSON returns 400", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader("{bad json"))
		w := httptest.NewRecorder()
		handleCompletions(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want 400", w.Code)
		}
	})

	t.Run("plain text default response", func(t *testing.T) {
		body := makeBody(t, []chatMessage{
			{Role: "user", Content: mustJSONMsg("hello")},
		}, nil)
		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", body)
		w := httptest.NewRecorder()
		handleCompletions(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("status = %d, want 200", w.Code)
		}
		text := collectSSEText(t, w.Body.String())
		if !strings.Contains(text, "MOCK_RESPONSE") {
			t.Errorf("response %q missing MOCK_RESPONSE", text)
		}
		if !strings.Contains(text, "hello") {
			t.Errorf("response %q missing echoed text", text)
		}
	})

	t.Run("tool-result round-trip returns MOCK_TOOL_DONE", func(t *testing.T) {
		body := makeBody(t, []chatMessage{
			{Role: "user", Content: mustJSONMsg("READ_FILE foo.txt")},
			{Role: "tool", Content: mustJSONMsg("file contents here")},
		}, []chatTool{readTool})
		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", body)
		w := httptest.NewRecorder()
		handleCompletions(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("status = %d, want 200", w.Code)
		}
		text := collectSSEText(t, w.Body.String())
		if !strings.Contains(text, "MOCK_TOOL_DONE") {
			t.Errorf("response %q missing MOCK_TOOL_DONE", text)
		}
	})

	t.Run("READ_FILE dispatches read tool call", func(t *testing.T) {
		body := makeBody(t, []chatMessage{
			{Role: "user", Content: mustJSONMsg("READ_FILE /etc/hosts")},
		}, []chatTool{readTool})
		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", body)
		w := httptest.NewRecorder()
		handleCompletions(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("status = %d, want 200", w.Code)
		}
		name, args := collectSSEToolCall(t, w.Body.String())
		if name != "read" {
			t.Errorf("tool name = %q, want %q", name, "read")
		}
		if !strings.Contains(args, "/etc/hosts") {
			t.Errorf("tool args %q missing path /etc/hosts", args)
		}
	})

	t.Run("WRITE_FILE dispatches write tool call", func(t *testing.T) {
		body := makeBody(t, []chatMessage{
			{Role: "user", Content: mustJSONMsg("WRITE_FILE out.txt hello there")},
		}, []chatTool{writeTool})
		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", body)
		w := httptest.NewRecorder()
		handleCompletions(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("status = %d, want 200", w.Code)
		}
		name, args := collectSSEToolCall(t, w.Body.String())
		if name != "write" {
			t.Errorf("tool name = %q, want %q", name, "write")
		}
		if !strings.Contains(args, "out.txt") {
			t.Errorf("tool args %q missing path out.txt", args)
		}
		if !strings.Contains(args, "hello there") {
			t.Errorf("tool args %q missing content", args)
		}
	})

	t.Run("RUN_BASH dispatches bash tool call", func(t *testing.T) {
		body := makeBody(t, []chatMessage{
			{Role: "user", Content: mustJSONMsg("RUN_BASH echo ok")},
		}, []chatTool{bashTool})
		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", body)
		w := httptest.NewRecorder()
		handleCompletions(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("status = %d, want 200", w.Code)
		}
		name, args := collectSSEToolCall(t, w.Body.String())
		if name != "bash" {
			t.Errorf("tool name = %q, want %q", name, "bash")
		}
		if !strings.Contains(args, "echo ok") {
			t.Errorf("tool args %q missing command", args)
		}
	})

	t.Run("READ_FILE without read tool falls through to plain text", func(t *testing.T) {
		// No tools registered — keyword should not dispatch a tool call.
		body := makeBody(t, []chatMessage{
			{Role: "user", Content: mustJSONMsg("READ_FILE foo.txt")},
		}, nil)
		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", body)
		w := httptest.NewRecorder()
		handleCompletions(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("status = %d, want 200", w.Code)
		}
		text := collectSSEText(t, w.Body.String())
		if !strings.Contains(text, "MOCK_RESPONSE") {
			t.Errorf("response %q should be plain text when tool not available", text)
		}
	})
}
