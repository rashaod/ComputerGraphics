#include "MiniFB.h"
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>


extern "C" {
#include "microui.h"
}
#include "ui_bridge.h"
#include "ui_renderer.h"

#define WIDTH 1000
#define HEIGHT 700

static uint32_t g_buffer[WIDTH * HEIGHT];
static float g_color_phase = 0.0f;
static float wave_freq = 0.02f;
static int waves_enabled = 1;
struct Line { int x0, y0, x1, y1; uint32_t color; };
static Line g_lines[1000];
static int g_line_count = 0;

static bool g_is_dragging = false;
static int g_drag_start_x = 0, g_drag_start_y = 0;

static float draw_r = 255.0f, draw_g = 255.0f, draw_b = 255.0f;
void draw_line(int x0, int y0, int x1, int y1, uint32_t color) {
  int dx = abs(x1 - x0);
  int dy = -abs(y1 - y0);
  int sx = (x0 < x1) ? 1 : -1;
  int sy = (y0 < y1) ? 1 : -1;
  int err = dx + dy;

  int x = x0, y = y0;
  while (true) {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      g_buffer[y * WIDTH + x] = color;
    }
    if (x == x1 && y == y1) break;
    int e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

int main() {
 // GLM test (Part 0) - confirm library works
  glm::vec3 test_vec(1.0f, 2.0f, 3.0f);
  glm::mat4 test_mat = glm::translate(glm::mat4(1.0f), glm::vec3(5.0f, 0.0f, 0.0f));
  glm::vec4 result = test_mat * glm::vec4(test_vec, 1.0f);
  printf("GLM test: translated vec3(1,2,3) by (5,0,0) -> (%.1f, %.1f, %.1f)\n", result.x, result.y, result.z);

  struct mfb_window *window =
      mfb_open_ex("MiniGUI Platform", WIDTH, HEIGHT, MFB_WF_RESIZABLE);
  if (!window)
    return 1;

  mu_Context *ctx = (mu_Context *)malloc(sizeof(mu_Context));
  mu_init(ctx);

  // Set font callbacks for microui
  ctx->text_width = [](mu_Font font, const char *str, int len) {
    return (len < 0 ? (int)strlen(str) : len) * 8;
  };
  ctx->text_height = [](mu_Font font) { return 8; };

  UIRenderer renderer(WIDTH, HEIGHT);

  // Set up char input callback for textbox input
mfb_set_char_input_callback(
      [](struct mfb_window *w, unsigned int c) {
        if (c == 'c') {
          g_color_phase += 2.0f;  // shift colors on each press
          return; // consume the event, don't pass to UI
        }
        extern void ui_bridge_char_input(struct mfb_window *, unsigned int);
        ui_bridge_char_input(w, c);
      },
      window);

  while (mfb_update_events(window) != MFB_STATE_EXIT) {
    // 1. Input
    ui_bridge_input(ctx, window);
        // Line drawing input (Part 6)
    if (mfb_get_mouse_button_buffer(window)[MFB_MOUSE_LEFT] && !g_is_dragging && ctx->hover == 0) {
      g_is_dragging = true;
      g_drag_start_x = (int)ctx->mouse_pos.x;
      g_drag_start_y = (int)ctx->mouse_pos.y;
    }
    if (!mfb_get_mouse_button_buffer(window)[MFB_MOUSE_LEFT] && g_is_dragging) {
      g_is_dragging = false;
      if (g_line_count < 1000) {
        g_lines[g_line_count].x0 = g_drag_start_x;
        g_lines[g_line_count].y0 = g_drag_start_y;
        g_lines[g_line_count].x1 = (int)ctx->mouse_pos.x;
        g_lines[g_line_count].y1 = (int)ctx->mouse_pos.y;
       g_lines[g_line_count].color = MFB_RGB((uint8_t)draw_r, (uint8_t)draw_g, (uint8_t)draw_b);
        g_line_count++;
      }
    }

// 2. Scene Rendering (Background)
    for (int i = 0; i < WIDTH * HEIGHT; i++) {
      int x = i % WIDTH;
      int y = i / WIDTH;
      uint8_t r, g, b;
      if (waves_enabled) {
        r = (uint8_t)(128 + 127 * sinf((x + y) * wave_freq + g_color_phase));
        g = (uint8_t)(128 + 127 * sinf((x - y) * wave_freq + g_color_phase));
        b = 100;
      } else {
        r = g = b = 40; // flat dark gray when disabled
      }
      g_buffer[i] = MFB_RGB(r, g, b);
    }

    // Draw all permanent lines (Part 6)
    for (int li = 0; li < g_line_count; li++) {
      draw_line(g_lines[li].x0, g_lines[li].y0, g_lines[li].x1, g_lines[li].y1, g_lines[li].color);
    }

 // Draw live preview line while dragging
    if (g_is_dragging) {
      draw_line(g_drag_start_x, g_drag_start_y, (int)ctx->mouse_pos.x, (int)ctx->mouse_pos.y, MFB_RGB((uint8_t)draw_r, (uint8_t)draw_g, (uint8_t)draw_b));
    }
    
    // 3. UI Logic
    static float slider_val = 50.0f;
    static float number_val = 3.14f;
    static int checkbox_a = 0;
    static int checkbox_b = 1;
    static char textbox_buf[128] = "edit me";
    static bool quit_requested = false;
    static int show_secret = 0;

    mu_begin(ctx);

    // --- Widgets window ---
    if (mu_begin_window(ctx, "Widgets", mu_rect(20, 20, 360, 540))) {
      int w1[] = {-1};

      // label / text
      mu_layout_row(ctx, 1, w1, 0);
      mu_label(ctx, "Line color (R):");
      mu_slider(ctx, &draw_r, 0, 255);
      mu_label(ctx, "Line color (G):");
      mu_slider(ctx, &draw_g, 0, 255);
      mu_label(ctx, "Line color (B):");
      mu_slider(ctx, &draw_b, 0, 255);
      mu_label(ctx, "mu_label: plain static text");
      mu_text(ctx, "mu_text: word-wrapped longer text that will reflow inside "
                   "the window width automatically.");

      // button
      mu_layout_row(ctx, 1, w1, 0);
      if (mu_button(ctx, "mu_button: click me")) {
        quit_requested = false; // just a reaction
      }

      // checkbox
      mu_layout_row(ctx, 1, w1, 0);
      mu_checkbox(ctx, "mu_checkbox A (off)", &checkbox_a);
      mu_checkbox(ctx, "mu_checkbox B (on)", &checkbox_b);

      mu_layout_row(ctx, 1, w1, 0);
      mu_checkbox(ctx, "Toggle secret message", &show_secret);
      if (show_secret) {
        mu_label(ctx, "You found the secret message!");
      } else {
       mu_label(ctx, "Check the box above...");
      }
      // wave pattern controls (Part 5)
      mu_layout_row(ctx, 1, w1, 0);
      mu_label(ctx, "Wave frequency:");
      mu_slider(ctx, &wave_freq, 0.001f, 0.1f);

      mu_layout_row(ctx, 1, w1, 0);
      mu_checkbox(ctx, "Enable wave pattern", &waves_enabled);
      // textbox
      mu_layout_row(ctx, 1, w1, 0);
      mu_label(ctx, "mu_textbox:");
      mu_textbox(ctx, textbox_buf, sizeof(textbox_buf));

      // slider
      mu_layout_row(ctx, 1, w1, 0);
      mu_label(ctx, "mu_slider (0-100):");
      mu_slider(ctx, &slider_val, 0, 100);

      // number
      mu_layout_row(ctx, 1, w1, 0);
      mu_label(ctx, "mu_number (step 0.1):");
      mu_number(ctx, &number_val, 0.1f);

      // header (collapsible section)
      if (mu_header(ctx, "mu_header: collapsible section")) {
        mu_layout_row(ctx, 1, w1, 0);
        mu_label(ctx, "Content inside the header.");
      }

      // treenode
      if (mu_begin_treenode(ctx, "mu_treenode: root")) {
        mu_layout_row(ctx, 1, w1, 0);
        mu_label(ctx, "child item A");
        if (mu_begin_treenode(ctx, "nested node")) {
          mu_layout_row(ctx, 1, w1, 0);
          mu_label(ctx, "deeply nested item");
          mu_end_treenode(ctx);
        }
        mu_end_treenode(ctx);
      }

      // quit button
      mu_layout_row(ctx, 1, w1, 0);
      if (mu_button(ctx, "Quit")) {
        quit_requested = true;
      }

      mu_end_window(ctx);
    }

    // --- Panel window ---
    if (mu_begin_window(ctx, "Panel Demo", mu_rect(395, 20, 380, 200))) {
      int w2[] = {-1};
      mu_layout_row(ctx, 1, w2, 120);
      mu_begin_panel(ctx, "scrollable panel");
      int wp[] = {-1};
      for (int i = 1; i <= 12; i++) {
        mu_layout_row(ctx, 1, wp, 0);
        char line[32];
        snprintf(line, sizeof(line), "Panel row %d", i);
        mu_label(ctx, line);
      }
      mu_end_panel(ctx);
      mu_end_window(ctx);
    }

    // --- Popup demo window ---
    if (mu_begin_window(ctx, "Popup Demo", mu_rect(395, 235, 380, 80))) {
      int w3[] = {-1};
      mu_layout_row(ctx, 1, w3, 0);
      if (mu_button(ctx, "Open popup")) {
        mu_Container *popup = mu_get_container(ctx, "my popup");
        popup->rect = mu_rect(ctx->mouse_pos.x, ctx->mouse_pos.y, 260, 84);
        popup->open = 1;
        ctx->hover_root = ctx->next_hover_root = popup;
        mu_bring_to_front(ctx, popup);
      }
      int popup_opt = MU_OPT_POPUP | MU_OPT_NORESIZE | MU_OPT_NOSCROLL |
                      MU_OPT_NOTITLE | MU_OPT_CLOSED;
      if (mu_begin_window_ex(ctx, "my popup", mu_rect(0, 0, 260, 84),
                             popup_opt)) {
        int wp[] = {-1};
        mu_layout_row(ctx, 1, wp, 0);
        mu_label(ctx, "mu_popup: click outside to close");
        if (mu_button(ctx, "Close")) {
          mu_get_current_container(ctx)->open = 0;
        }
        mu_end_window(ctx);
      }
      mu_end_window(ctx);
    }

    mu_end(ctx);

    if (quit_requested) {
      mfb_close(window);
      break;
    }

    // 4. UI Rendering
    renderer.render(ctx, g_buffer);

    // 5. Display
    mfb_update_state state = mfb_update_ex(window, g_buffer, WIDTH, HEIGHT);
    if (state < 0)
      break;

    // Cap FPS (optional, minifb has built-in sync)
    mfb_wait_sync(window);
  }

  mfb_close(window);
  free(ctx);
  return 0;
}
