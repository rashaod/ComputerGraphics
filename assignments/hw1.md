# Assignment: Basic Graphics and Immediate Mode GUI

## Overview

In this assignment, you will explore low-level computer graphics and Immediate Mode Graphical User Interfaces, and draw some lines and curves. You will manipulate a raw framebuffer to render graphics and modify a real-time rendering loop to understand how UI state is calculated and drawn independently of user input.

### Part 1: Manipulating the Framebuffer

##### Background: The Framebuffer and MiniFB
The image you see on your screen is ultimately driven by a **framebuffer**â€”a dedicated block of memory that holds the color data for every pixel on your display. In our application, we calculate these pixels by writing to `g_buffer`, which is simply a contiguous 1D array of 32-bit integers in memory. 

However, writing to `g_buffer` doesn't automatically draw it to the screen. To do that, we use a lightweight library called **MiniFB** (Mini Framebuffer), which manages the window system and event updates. Every frame, MiniFB takes our completed `g_buffer` array and handles the low-level operating system calls to push our pixel data into the actual hardware framebuffer so it appears on your monitor.

##### Background: 32-bit ARGB Colors
Every 32-bit integer in our `g_buffer` array represents 4 bytes of memory, which define the precise **ARGB** color of exactly one pixel on the screen. 

ARGB stands for **A**lpha, **R**ed, **G**reen, and **B**lue. The **Alpha** channel determines the opacity or transparency of a pixel. In this assignment, we will ignore the alpha channel entirely because we are writing solid colors directly to the screen and do not need to calculate complex transparency blending. 

Instead of writing 32-bit integers manually, we use a macro called `MFB_RGB(r, g, b)`. **It is highly encouraged to look at the implementation of this macro** to see exactly how it shifts and combines separate red, green, and blue values into a single 32-bit integer!

##### Task
Open `main.cpp` and locate the Scene Rendering (Background) loop. Notice the `for` loop iterating over `WIDTH * HEIGHT`. Inside, it calculates the 2D `x` and `y` coordinates based on the 1D index `i`. It then assigns a 32-bit color integer to `g_buffer[i]` using the `MFB_RGB(r, g, b)` macro.

**Write a new mathematical expression for `r`, `g`, and `b` that will draw something different and creative.** Instead of just making a solid color, try generating gradients, shapes, or interesting patterns using the `x`, `y`, and `i` variables. Write a new expression that utilizes both the `x` and `y` coordinates to create a visible 2D pattern (e.g., a gradient, a checkerboard, or concentric circles). For full credit, the pattern cannot be a solid color or a 1D horizontal/vertical strip. Note: You are welcome to use AI to assist you in coming up with the math for these visual patterns!


### Part 2: Immediate Mode UI Declaration

##### Background: The Basics of GUIs and Widgets
A Graphical User Interface (GUI) allows users to interact with a program through visual building blocks. Depending on the software framework you use, these interactive building blocks go by many different names, most commonly **"widgets", "controls", "elements", or "components"**. 

Typical GUI elements include:
*   **Buttons:** Clickable areas that trigger specific actions.
*   **Sliders:** Draggable tracks used to select a numeric value from a specific range.
*   **Labels:** Static text blocks used to display information.
*   **Text Inputs & Checkboxes:** Fields for capturing string input or toggling true/false boolean states.

##### Background: Retained vs. Immediate Mode Architectures
When programming a UI, there are two primary architectural paradigms you will encounter:

1.  **Retained Mode:** UI elements are instantiated as persistent objects in memory, stored by the system, and eventually destroyed when no longer needed. 
2.  **Immediate Mode:** The entire UI is declared from scratch every single frame via sequential function calls. 

In this project, we are using a library called **MicroUI**, which implements an **Immediate Mode** architecture. MicroUI functions as an abstract state machine: it calculates layouts and interaction states, but because the widgets are destroyed and recreated every frame, they cannot store their own internal data. Instead, they read and mutate external variables in your application using memory pointers.

##### Task
In `main.cpp` under the `mu_begin(ctx)` block, add a new interactive widget (such as a button or checkbox) that simply prints a message to the console or toggles a static text label within the MicroUI window. This will allow you to practice Immediate Mode syntax and UI layout without worrying about the broader application state yet.


### Part 3: The Real-Time Graphics Loop and Input Handling

##### Background: The Event Loop and Callbacks
To maintain a smooth framerate and interactive application, the program executes a strict chronological sequence of operations many times per secondâ€”commonly referred to as the **event loop**. In our code, this primary loop is controlled by `while (mfb_update_events(window) != MFB_STATE_EXIT)`. 

But how does the operating system interface with input devices (like a keyboard) and pass that data into our loop? It relies on **callbacks**. A callback is a function that you pass to the window manager so the OS knows exactly what code to execute when a hardware interrupt (like a keystroke) occurs. 

For example, in `main.cpp`, we register a function using `mfb_set_char_input_callback`. When a user presses a key, the OS triggers this callback, which calls `ui_bridge_char_input` to save the keystroke into a temporary array called `g_pending_text`. Later, during the sequential event loop, `ui_bridge_input` checks this array and feeds the captured input into the UI system. This separation ensures that unpredictable user inputs are safely synchronized with the strict timing of our rendering loop.

##### Task
In `main.cpp`, locate the character input callback (`mfb_set_char_input_callback`) just above the main event loop. **Be creative and intercept the input pipeline to trigger a custom visual effect:** write custom logic inside the callback so that pressing a specific key on your keyboard dynamically alters an application state variable, instantly changing the background pattern, randomizing the colors, or toggling a visual effect on the screen! 

*Note on event consumption:* If you intercept an event here, you must decide whether to "consume" it (stop the UI from seeing it) or pass it along to the UI bridge (`g_pending_text`) so normal widgets still function correctly.


### Part 4: UI Architecture & The Renderer Bridge

##### Background: Abstract State vs. Visual Rendering
As you have learned, MicroUI generates an abstract list of commands, such as drawing rectangles, text, or icons. However, MicroUI itself has absolutely no concept of pixels or how to draw them to your screen.

To bridge this gap, we use a separate rendering system defined in our `UIRenderer` class. The `UIRenderer::render` function processes the queue of commands generated by MicroUI via a `while (mu_next_command(ctx, &cmd))` loop, translating these instructions into actual pixel manipulations.

This separation of concerns means that the physical boundaries where a button detects a "click" are calculated entirely independently from where the visual representation of that button is drawn to the framebuffer.

##### Task
Open `ui_renderer.cpp` and locate the rendering methods like `draw_rect` or `draw_text`. **Implement a custom visual transformation or stylistic override**â€”such as shifting coordinates, adding a wave effect, or injecting a color glitchâ€”specifically when calculating the 1D index and assigning pixels to `m_buffer`. Recompile and attempt to interact with your transformed UI elements on the screen. 

After applying your visual offset, attempt to click on a button. In your code comments or submission text, explain exactly *why* clicking the visual representation of your shifted button no longer works, and describe where you must put your mouse cursor to successfully trigger it.

---

### Part 5: Binding UI to Application State

##### Background: Memory Pointers and State Mutation
Because Immediate Mode widgets are destroyed and recreated from scratch every single frame, they are fundamentally "stateless"â€”meaning they cannot store their own internal memory.

To function interactively, widgets instead take pointers to external variables that live in your application logic. When you drag a slider, the widget doesn't update its own internal "slider value"; rather, it directly mutates the value at the specific memory address you provided using the C++ address-of operator (`&`).

##### Task
In `main.cpp`, observe how the variable `slider_val` is passed into the slider widget using `mu_slider(ctx, &slider_val, 0, 100);`. **Design a new interactive feature** by declaring your own custom application state variables and binding them to brand new widgets (like sliders or checkboxes) inside the `mu_begin_window` block. Connect these newly bound variables to your background rendering loop from Part 1 so that interacting with your UI dynamically morphs, recolors, or animates the creative visual pattern you generated.

### Part 6: Interactive Line Drawing App

##### Background: Implementing the Algorithm
In class, we discussed the theory behind **Bresenham's Line Algorithm** and how it elegantly approximates a straight line on a discrete pixel grid using only fast integer math. Now, it is time to translate that theory into a working renderer.

As you recall, calculating lines that go in any arbitrary direction means handling all eight possible octants (e.g., steep slopes vs. shallow slopes, drawing left-to-right vs. right-to-left). This can quickly lead to a messy explosion of `if-else` statements and redundant code. Your code should adhere to the *DRY* principle.

##### Task: Write the Line Function
Write a new function, such as `draw_line(int x0, int y0, int x1, int y1, uint32_t color)`, that calculates the pixels of a line between `(x0, y0)` and `(x1, y1)` using your optimized Bresenham's implementation. For each calculated pixel, assign the `color` to the correct 1D index in your `g_buffer`. Test it by hardcoding a few lines into your background render loop to verify the math is working across different slopes and directions.

##### Task: AI-Assisted UX Planning
Now, you must bridge the Immediate Mode UI concepts from Parts 2-5 with your new `draw_line` function to create an interactive drawing tool. But before you write the code, you need to design the interaction. 

**Use an AI assistant to brainstorm the User Experience (UX) for drawing.** Prompt the AI to discuss the pros, cons, and logic of different ways a user might draw a line with a mouse. 
*   Does the user click once to set the start point, and click again to set the end point? 
*   Do they click and hold, drag the mouse, and release to finalize the line? 
*   If they drag, how do you manage the "state" so the line is previewed but not permanently drawn until the mouse is released?

Reason through these approaches, choose the one you think makes the best application, and implement it using MicroUI's input and mouse state variables.

##### Task: The Creative Canvas
Combine everything you have built into a useful, interactive tool. The baseline requirement is that the user can interactively draw multiple permanent lines onto the screen. 

However, you are highly encouraged to push the limits of your architecture. An ambitious implementation might feature:
*   A UI panel with sliders to control the RGB values of the current line.
*   A "Clear Screen" button.
*   An automated "spirograph" mode that draws algorithmic lines based on UI slider parameters.
*   Logic to handle drawing continuous, connected lines (a brush tool).

Design an interface and visual result that you are proud of!

### Part 7: Pair Programming Extensions

*Students working in pairs are required to complete the following three extensions to receive full credit.*

##### 1. Bresenham's Circle Algorithm
*   **Background:** The principles of Bresenham's line algorithm can be extended to draw circles by exploiting 8-way symmetryâ€”you only need to calculate the math for one octant and mirror the pixels to the other seven.
*   **Task:** Implement a `draw_circle(int xc, int yc, int r, uint32_t color)` function. Update your AI-assisted UI from Part 6 to support a "Circle Mode," allowing the user to click and drag to dynamically define the center and radius of a circle. 

##### 2. Performance Profiling: Bresenham vs. Naive
*   **Background:** Bresenham's algorithm was designed to avoid expensive floating-point arithmetic. However, modern CPUs process floating-point math significantly faster than hardware from the 1960s. Is the strict integer optimization still noticeably faster today?
*   **Task:** Implement a "naive" line drawing function that uses standard `float` math (calculating the slope $m$ and evaluating $y = mx + b$). Write a benchmarking routine that draws 100,000 random lines using both algorithms. Log the execution times to the console to definitively compare their performance on your specific hardware.

##### 3. Anti-Aliasing: Xiaolin Wu's Algorithm
*   **Background:** Bresenham's algorithm produces "aliased" (jagged) lines. Xiaolin Wu's line algorithm solves this by drawing pairs of pixels that straddle the mathematical line, distributing the color intensity based on the exact fractional distance to the line's true center. 
*   **Task:** Implement Xiaolin Wu's line algorithm. Because our assignment ignores the alpha channel (as established in Part 1). Note what happens when you draw a line on top of another line and attempt to fix the issue. Finally, add a UI toggle to instantly switch between Bresenham and Xiaolin Wu modes to visually compare the results.- - -  
  
 #   S u b m i s s i o n   R e p o r t   Ò¬    A s s i g n m e n t   1 :   B a s i c   G r a p h i c s   a n d   I m m e d i a t e   M o d e   G U I  
  
 # #   P a r t   1 :   M a n i p u l a t i n g   t h e   F r a m e b u f f e r  
  
 # # #   A p p r o a c h  
 I   m o d i f i e d   t h e   b a c k g r o u n d   r e n d e r i n g   l o o p   i n   ` m a i n . c p p `   t o   g e n e r a t e   a   * * d i a g o n a l   w a v e   i n t e r f e r e n c e   p a t t e r n * *   i n s t e a d   o f   t h e   o r i g i n a l   l i n e a r   g r a d i e n t .   T h e   o r i g i n a l   c o d e   u s e d   ` x `   f o r   r e d   a n d   ` y `   f o r   g r e e n   i n d e p e n d e n t l y   Ò¬    p r o d u c i n g   a   s i m p l e   t w o - a x i s   g r a d i e n t   w i t h   n o   r e a l   2 D   i n t e r a c t i o n   b e t w e e n   t h e   a x e s .  
  
 M y   i m p l e m e n t a t i o n   c o m b i n e s   ` x `   a n d   ` y `   t o g e t h e r   u s i n g   ` s i n f ( ) ` :  
  
 ` ` ` c p p  
 u i n t 8 _ t   r   =   ( u i n t 8 _ t ) ( 1 2 8   +   1 2 7   *   s i n f ( ( x   +   y )   *   w a v e _ f r e q   +   g _ c o l o r _ p h a s e ) ) ;  
 u i n t 8 _ t   g   =   ( u i n t 8 _ t ) ( 1 2 8   +   1 2 7   *   s i n f ( ( x   -   y )   *   w a v e _ f r e q   +   g _ c o l o r _ p h a s e ) ) ;  
 u i n t 8 _ t   b   =   1 0 0 ;  
 ` ` `  
  
 -   T h e   * * r e d   c h a n n e l * *   o s c i l l a t e s   a l o n g   ` x   +   y `   Ò¬    d i a g o n a l   b a n d s   g o i n g   t o p - l e f t   t o   b o t t o m - r i g h t .  
 -   T h e   * * g r e e n   c h a n n e l * *   o s c i l l a t e s   a l o n g   ` x   -   y `   Ò¬    d i a g o n a l   b a n d s   g o i n g   t h e   o p p o s i t e   d i r e c t i o n .  
 -   S i n c e   ` s i n f ( ) `   o u t p u t s   v a l u e s   b e t w e e n   - 1   a n d   1 ,   I   s c a l e d   b y   1 2 7   a n d   s h i f t e d   b y   1 2 8   t o   k e e p   a l l   v a l u e s   i n   t h e   v a l i d   0 Ò¬  2 5 5   b y t e   r a n g e .  
 -   T h e   t w o   c r o s s i n g   d i a g o n a l   w a v e   p a t t e r n s   i n t e r f e r e   w i t h   e a c h   o t h e r ,   c r e a t i n g   a   c r o s s h a t c h - s t y l e   c o l o r   s h i m m e r   a c r o s s   t h e   s c r e e n .  
  
 # # #   R e s u l t  
 ! [ P a r t   1   Ò¬    D i a g o n a l   W a v e   P a t t e r n ] ( . . / n a n o r e n d e r / a s s e t s / h w 1 _ s t e p 1 d e f . p n g )  
  
 - - -  
  
 # #   P a r t   2 :   I m m e d i a t e   M o d e   U I   D e c l a r a t i o n  
  
 # # #   A p p r o a c h  
 I   a d d e d   a   n e w   c h e c k b o x   w i d g e t   b o u n d   t o   a   ` s t a t i c   i n t   s h o w _ s e c r e t `   v a r i a b l e .   B e l o w   i t ,   a   l a b e l   i s   r e c a l c u l a t e d   e v e r y   f r a m e   b a s e d   o n   t h e   c h e c k b o x ' s   c u r r e n t   v a l u e :  
  
 ` ` ` c p p  
 m u _ c h e c k b o x ( c t x ,   " T o g g l e   s e c r e t   m e s s a g e " ,   & s h o w _ s e c r e t ) ;  
 i f   ( s h o w _ s e c r e t )   {  
     m u _ l a b e l ( c t x ,   " Y o u   f o u n d   t h e   s e c r e t   m e s s a g e ! " ) ;  
 }   e l s e   {  
     m u _ l a b e l ( c t x ,   " C h e c k   t h e   b o x   a b o v e . . . " ) ;  
 }  
 ` ` `  
  
 # # #   I m m e d i a t e   M o d e   D e m o n s t r a t i o n  
 T h i s   i l l u s t r a t e s   t h e   c o r e   I m m e d i a t e   M o d e   p r i n c i p l e :   t h e   c h e c k b o x   h a s   n o   i n t e r n a l   m e m o r y   o f   i t s   o w n .   E a c h   f r a m e ,   ` m u _ c h e c k b o x `   d i r e c t l y   m u t a t e s   ` s h o w _ s e c r e t `   t h r o u g h   t h e   p o i n t e r   p a s s e d   t o   i t ,   a n d   t h e   l a b e l   c o n t e n t   i s   f r e s h l y   d e c i d e d   b y   t h e   ` i f `   s t a t e m e n t   e v e r y   s i n g l e   f r a m e .   T h e r e   i s   n o   p e r s i s t e n t   " L a b e l   o b j e c t "   b e i n g   u p d a t e d   Ò¬    t h e   e n t i r e   U I   t r e e   i s   r e b u i l t   f r o m   s c r a t c h   e a c h   f r a m e .  
  
 # # #   R e s u l t  
 ! [ P a r t   2   Ò¬    T o g g l e   C h e c k b o x ] ( . . / n a n o r e n d e r / a s s e t s / f i r s t S t e p . p n g )  
  
 - - -  
  
 # #   P a r t   3 :   T h e   R e a l - T i m e   G r a p h i c s   L o o p   a n d   I n p u t   H a n d l i n g  
  
 # # #   A p p r o a c h  
 I   a d d e d   a   g l o b a l   s t a t e   v a r i a b l e   ` g _ c o l o r _ p h a s e `   a n d   m o d i f i e d   t h e   c h a r a c t e r   i n p u t   c a l l b a c k   s o   t h a t   p r e s s i n g   ` c `   s h i f t s   t h e   c o l o r   p h a s e   o f   t h e   b a c k g r o u n d   w a v e   p a t t e r n :  
  
 ` ` ` c p p  
 m f b _ s e t _ c h a r _ i n p u t _ c a l l b a c k (  
     [ ] ( s t r u c t   m f b _ w i n d o w   * w ,   u n s i g n e d   i n t   c )   {  
         i f   ( c   = =   ' c ' )   {  
             g _ c o l o r _ p h a s e   + =   2 . 0 f ;  
             r e t u r n ;   / /   c o n s u m e   t h e   e v e n t  
         }  
         e x t e r n   v o i d   u i _ b r i d g e _ c h a r _ i n p u t ( s t r u c t   m f b _ w i n d o w   * ,   u n s i g n e d   i n t ) ;  
         u i _ b r i d g e _ c h a r _ i n p u t ( w ,   c ) ;  
     } ,  
     w i n d o w ) ;  
 ` ` `  
  
 ` g _ c o l o r _ p h a s e `   i s   a d d e d   i n t o   t h e   ` s i n f ( ) `   c a l c u l a t i o n s   i n   t h e   b a c k g r o u n d   l o o p ,   s o   e a c h   p r e s s   o f   ` c `   v i s i b l y   s h i f t s   t h e   w a v e   p a t t e r n ' s   c o l o r s .  
  
 # # #   E v e n t   C o n s u m p t i o n  
 N o t e   t h e   ` r e t u r n ; `   a f t e r   h a n d l i n g   ` ' c ' ` .   T h i s   * * c o n s u m e s * *   t h e   e v e n t   Ò¬    t h e   k e y s t r o k e   n e v e r   r e a c h e s   ` u i _ b r i d g e _ c h a r _ i n p u t ` ,   s o   i t   w o n ' t   b e   t y p e d   i n t o   a n y   f o c u s e d   t e x t b o x .   H a d   I   o m i t t e d   t h e   ` r e t u r n ` ,   t h e   c h a r a c t e r   ` ' c ' `   w o u l d   f a l l   t h r o u g h   t o   t h e   U I   b r i d g e   a n d   b e   t y p e d   i n t o   a n y   f o c u s e d   t e x t b o x .   I   c h o s e   t o   c o n s u m e   i t   h e r e   b e c a u s e   ` c `   i s   m e a n t   a s   a   g l o b a l   a p p l i c a t i o n   s h o r t c u t ,   n o t   a   p r i n t a b l e   c h a r a c t e r .  
  
 # # #   R e s u l t  
 ! [ P a r t   3   Ò¬    C o l o r   P h a s e   S h i f t ] ( . . / n a n o r e n d e r / a s s e t s / s e c o n d S t e p . p n g )  
  
 - - -  
  
 # #   P a r t   4 :   U I   A r c h i t e c t u r e   a n d   t h e   R e n d e r e r   B r i d g e  
  
 # # #   A p p r o a c h  
 I n   ` u i _ r e n d e r e r . c p p ` ,   I   m o d i f i e d   ` d r a w _ r e c t `   t o   a p p l y   a   v i s u a l   p i x e l   o f f s e t   w h e n   w r i t i n g   t o   ` m _ b u f f e r ` ,   w i t h o u t   c h a n g i n g   t h e   l o g i c a l   r e c t   c o o r d i n a t e s   u s e d   f o r   l a y o u t   a n d   h i t - t e s t i n g :  
  
 ` ` ` c p p  
 i n t   s h i f t _ x   =   1 0 0 ;  
 i n t   s h i f t _ y   =   8 0 ;  
  
 f o r   ( i n t   y   =   y 1 ;   y   <   y 2 ;   y + + )   {  
         f o r   ( i n t   x   =   x 1 ;   x   <   x 2 ;   x + + )   {  
                 i n t   d x   =   x   +   s h i f t _ x ;  
                 i n t   d y   =   y   +   s h i f t _ y ;  
                 i f   ( d x   > =   0   & &   d x   <   m _ w i d t h   & &   d y   > =   0   & &   d y   <   m _ h e i g h t )   {  
                         m _ b u f f e r [ d y   *   m _ w i d t h   +   d x ]   =   c ;  
                 }  
         }  
 }  
 ` ` `  
  
 T h i s   c h a n g e   w a s   r e v e r t e d   a f t e r   t h e   e x p e r i m e n t   s o   t h e   U I   r e m a i n e d   u s a b l e   f o r   t h e   r e s t   o f   t h e   a s s i g n m e n t .  
  
 # # #   R e s u l t   a n d   E x p l a n a t i o n  
 A f t e r   a p p l y i n g   t h e   o f f s e t ,   a l l   b u t t o n / w i n d o w   b a c k g r o u n d   r e c t a n g l e s   v i s u a l l y   s h i f t e d   1 0 0 p x   r i g h t   a n d   8 0 p x   d o w n .   H o w e v e r ,   ` d r a w _ t e x t `   w a s   l e f t   u n m o d i f i e d ,   s o   t e x t   l a b e l s   r e m a i n e d   a t   t h e i r   o r i g i n a l   p o s i t i o n s .  
  
 * * K e y   f i n d i n g : * *   C l i c k i n g   d i r e c t l y   o n   t h e   v i s i b l e   " Q u i t "   t e x t   s u c c e s s f u l l y   t r i g g e r e d   t h e   q u i t   a c t i o n ,   w h i l e   c l i c k i n g   o n   t h e   v i s i b l y   s h i f t e d   g r a y   r e c t a n g l e   b a c k g r o u n d   d i d   n o t h i n g .  
  
 T h i s   h a p p e n s   b e c a u s e   M i c r o U I ' s   i n p u t   h i t - t e s t i n g   a l w a y s   o p e r a t e s   o n   t h e   * o r i g i n a l *   r e c t   c o o r d i n a t e s   p a s s e d   i n t o   t h e   i m m e d i a t e - m o d e   c a l l s   Ò¬    i t   h a s   n o   a w a r e n e s s   o f   w h e r e   p i x e l s   w e r e   u l t i m a t e l y   d r a w n   t o   t h e   f r a m e b u f f e r .   T h e   ` U I R e n d e r e r `   i s   s o l e l y   r e s p o n s i b l e   f o r   t r a n s l a t i n g   l o g i c a l   r e c t s   i n t o   p i x e l s ;   s h i f t i n g   t h a t   t r a n s l a t i o n   d o e s   n o t   a f f e c t   M i c r o U I ' s   i n t e r n a l   l a y o u t   o r   c l i c k - d e t e c t i o n   m a t h   a t   a l l .  
  
 # # #   R e s u l t  
 ! [ P a r t   4   Ò¬    V i s u a l   O f f s e t   E x p e r i m e n t ] ( . . / n a n o r e n d e r / a s s e t s / t h i r d S t e p . p n g )  
  
 - - -  
  
 # #   P a r t   5 :   B i n d i n g   U I   t o   A p p l i c a t i o n   S t a t e  
  
 # # #   A p p r o a c h  
 I   d e c l a r e d   t w o   n e w   g l o b a l   s t a t e   v a r i a b l e s   a l o n g s i d e   ` g _ c o l o r _ p h a s e ` :  
  
 ` ` ` c p p  
 s t a t i c   f l o a t   w a v e _ f r e q   =   0 . 0 2 f ;  
 s t a t i c   i n t   w a v e s _ e n a b l e d   =   1 ;  
 ` ` `  
  
 T h e s e   a r e   b o u n d   t o   t w o   n e w   w i d g e t s   i n s i d e   t h e   " W i d g e t s "   w i n d o w :  
  
 ` ` ` c p p  
 m u _ l a b e l ( c t x ,   " W a v e   f r e q u e n c y : " ) ;  
 m u _ s l i d e r ( c t x ,   & w a v e _ f r e q ,   0 . 0 0 1 f ,   0 . 1 f ) ;  
 m u _ c h e c k b o x ( c t x ,   " E n a b l e   w a v e   p a t t e r n " ,   & w a v e s _ e n a b l e d ) ;  
 ` ` `  
  
 T h e   b a c k g r o u n d   r e n d e r i n g   l o o p   f r o m   P a r t   1   r e a d s   t h e s e   v a r i a b l e s   e v e r y   f r a m e :  
  
 ` ` ` c p p  
 i f   ( w a v e s _ e n a b l e d )   {  
     r   =   ( u i n t 8 _ t ) ( 1 2 8   +   1 2 7   *   s i n f ( ( x   +   y )   *   w a v e _ f r e q   +   g _ c o l o r _ p h a s e ) ) ;  
     g   =   ( u i n t 8 _ t ) ( 1 2 8   +   1 2 7   *   s i n f ( ( x   -   y )   *   w a v e _ f r e q   +   g _ c o l o r _ p h a s e ) ) ;  
     b   =   1 0 0 ;  
 }   e l s e   {  
     r   =   g   =   b   =   4 0 ;   / /   f l a t   d a r k   g r a y   w h e n   d i s a b l e d  
 }  
 ` ` `  
  
 # # #   R e s u l t  
 D r a g g i n g   t h e   s l i d e r   l i v e - a d j u s t s   t h e   w a v e   b a n d   s p a c i n g   b y   c h a n g i n g   ` w a v e _ f r e q `   d i r e c t l y   t h r o u g h   t h e   p o i n t e r   ` & w a v e _ f r e q `   e v e r y   f r a m e .   U n c h e c k i n g   " E n a b l e   w a v e   p a t t e r n "   i m m e d i a t e l y   s w i t c h e s   t h e   b a c k g r o u n d   t o   f l a t   d a r k   g r a y   Ò¬    d e m o n s t r a t i n g   h o w   t h e   s a m e   I m m e d i a t e   M o d e   b i n d i n g   p a t t e r n   f r o m   P a r t   2   e x t e n d s   n a t u r a l l y   t o   d r i v e   p r o c e d u r a l   r e n d e r i n g .  
  
 # # #   R e s u l t  
 ! [ P a r t   5   Ò¬    W a v e   F r e q u e n c y   S l i d e r ] ( . . / n a n o r e n d e r / a s s e t s / f o r t h S t e p . p n g )  
  
 - - -  
  
 # #   P a r t   6 :   I n t e r a c t i v e   L i n e   D r a w i n g   A p p  
  
 # # #   B r e s e n h a m ' s   L i n e   A l g o r i t h m  
 I   i m p l e m e n t e d   ` d r a w _ l i n e `   u s i n g   t h e   u n i f i e d   s i n g l e - l o o p   v a r i a n t   o f   B r e s e n h a m ' s   a l g o r i t h m ,   w h i c h   a v o i d s   b r a n c h i n g   i n t o   s e p a r a t e   c o d e   p a t h s   f o r   e a c h   o f   t h e   8   o c t a n t s :  
  
 ` ` ` c p p  
 v o i d   d r a w _ l i n e ( i n t   x 0 ,   i n t   y 0 ,   i n t   x 1 ,   i n t   y 1 ,   u i n t 3 2 _ t   c o l o r )   {  
     i n t   d x   =   a b s ( x 1   -   x 0 ) ;  
     i n t   d y   =   - a b s ( y 1   -   y 0 ) ;  
     i n t   s x   =   ( x 0   <   x 1 )   ?   1   :   - 1 ;  
     i n t   s y   =   ( y 0   <   y 1 )   ?   1   :   - 1 ;  
     i n t   e r r   =   d x   +   d y ;  
     i n t   x   =   x 0 ,   y   =   y 0 ;  
     w h i l e   ( t r u e )   {  
         i f   ( x   > =   0   & &   x   <   W I D T H   & &   y   > =   0   & &   y   <   H E I G H T )  
             g _ b u f f e r [ y   *   W I D T H   +   x ]   =   c o l o r ;  
         i f   ( x   = =   x 1   & &   y   = =   y 1 )   b r e a k ;  
         i n t   e 2   =   2   *   e r r ;  
         i f   ( e 2   > =   d y )   {   e r r   + =   d y ;   x   + =   s x ;   }  
         i f   ( e 2   < =   d x )   {   e r r   + =   d x ;   y   + =   s y ;   }  
     }  
 }  
 ` ` `  
  
 ` s x ` / ` s y `   e n c o d e   d i r e c t i o n   a s   + 1 / - 1   i n s t e a d   o f   b r a n c h i n g   p e r   d i r e c t i o n ,   a n d   t h e   s i n g l e   ` e r r `   a c c u m u l a t o r   h a n d l e s   b o t h   s t e e p   a n d   s h a l l o w   s l o p e s   w i t h i n   t h e   s a m e   l o o p   b o d y   Ò¬    s a t i s f y i n g   t h e   D R Y   r e q u i r e m e n t .  
  
 # # #   A I - A s s i s t e d   U X   P l a n n i n g  
 B e f o r e   i m p l e m e n t i n g   i n t e r a c t i v e   d r a w i n g ,   I   u s e d   A I   a s s i s t a n c e   t o   r e a s o n   t h r o u g h   t h r e e   p o s s i b l e   U X   a p p r o a c h e s :  
  
 1 .   * * C l i c k - c l i c k   ( t w o   s e p a r a t e   c l i c k s ) : * *   S i m p l e   t o   i m p l e m e n t   b u t   n o   l i v e   p r e v i e w   a n d   r i s k s   a c c i d e n t a l   l i n e   c r e a t i o n .  
 2 .   * * C l i c k - d r a g - r e l e a s e : * *   M a t c h e s   t h e   s t a n d a r d   m e n t a l   m o d e l   o f   m o s t   d r a w i n g   t o o l s   ( P a i n t ,   F i g m a ,   e t c . ) ,   n a t u r a l l y   s u p p o r t s   a   l i v e   p r e v i e w   w h i l e   d r a g g i n g ,   a n d   o n l y   r e q u i r e s   t h r e e   p i e c e s   o f   s t a t e .  
 3 .   * * C o n t i n u o u s / b r u s h   m o d e : * *   G o o d   f o r   f r e e f o r m   s k e t c h i n g   b u t   o v e r k i l l   f o r   c l e a n   g e o m e t r i c   l i n e s .  
  
 I   c h o s e   * * c l i c k - d r a g - r e l e a s e * *   f o r   t h e   b e s t   b a l a n c e   o f   i n t u i t i v e   U X   a n d   s i m p l e   s t a t e   m a n a g e m e n t ,   w i t h   a   l i v e   p r e v i e w   s o   t h e   u s e r   c a n   s e e   e x a c t l y   w h e r e   t h e   l i n e   w i l l   l a n d   b e f o r e   c o m m i t t i n g .  
  
 # # #   T h e   C r e a t i v e   C a n v a s  
 I   i m p l e m e n t e d   p e r m a n e n t   l i n e   s t o r a g e   a n d   c l i c k - d r a g - r e l e a s e   i n t e r a c t i o n .   A   d r a g   b e g i n s   o n l y   w h e n   t h e   m o u s e   i s   p r e s s e d   o u t s i d e   a n y   M i c r o U I   w i d g e t   ( ` c t x - > h o v e r   = =   0 ` ) ,   p r e v e n t i n g   a c c i d e n t a l   l i n e   c r e a t i o n   w h i l e   i n t e r a c t i n g   w i t h   U I   p a n e l s .   W h i l e   d r a g g i n g ,   a   l i v e   p r e v i e w   l i n e   i s   d r a w n   e a c h   f r a m e ;   o n   r e l e a s e   t h e   l i n e   i s   c o m m i t t e d   p e r m a n e n t l y .  
  
 * * E x t e n s i o n s   a d d e d : * *  
 -   * * R G B   s l i d e r s * *   c o n t r o l l i n g   t h e   c o l o r   o f   t h e   n e x t   l i n e   d r a w n   ( a n d   t h e   l i v e   p r e v i e w )  
 -   * * A   " C l e a r   S c r e e n "   b u t t o n * *   r e s e t t i n g   ` g _ l i n e _ c o u n t `   t o   0  
  
 # # #   R e s u l t  
 ! [ P a r t   6   Ò¬    L i n e   D r a w i n g   w i t h   R G B   C o l o r   C o n t r o l ] ( . . / n a n o r e n d e r / a s s e t s / f i f t h S t e p 1 . p n g )  
 ! [ P a r t   6   Ò¬    D r a w i n g   i n   A c t i o n ] ( . . / n a n o r e n d e r / a s s e t s / f i f t h S t e p 2 . p n g )  
 