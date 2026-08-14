import json
import websocket
import pygame
from tkinter import simpledialog
import threading
import time
import random

ime=simpledialog.askstring("Input", "Enter your name:")
host=simpledialog.askstring("Input", "Enter the host IP:", initialvalue="ws://10.0.20.173:8080")

pygame.init()

canvas_color = (255, 255, 255)
pygame.display.set_caption("Volkovi in Zajci")

myimage0 = pygame.image.load("images/Grass.png")
#imagerect0 = myimage0.get_rect()
myimage1 = pygame.image.load("images/Bush.png")
#imagerect1 = myimage1.get_rect()
myimage21 = pygame.image.load("images/voda.png")
myimage22 = pygame.image.load("images/voda1.png")
myimage23 = pygame.image.load("images/voda2.png")
myimage24 = pygame.image.load("images/voda3.png")
myimage25 = pygame.image.load("images/voda4.png")
myimage26 = pygame.image.load("images/water.png")
water_images = [myimage21, myimage22, myimage23, myimage24, myimage25, myimage26]
#imagerect2 = myimage2.get_rect()
myimage3 = pygame.image.load("images/stone.png")
#imagerect3 = myimage3.get_rect()
myimage4 = pygame.image.load("images/grasswithflowers.png")

myimage5 = pygame.image.load("images/bear_trap.png")

myimage6 = pygame.image.load("images/luknja.png")

font = pygame.font.Font('freesansbold.ttf', 15)
import websocket
ws = websocket.WebSocket()
ws.connect(host)
ws.send('{"type":"hello","displayName":"'+ime+'"}')
welc=json.loads(ws.recv())
canvas = pygame.display.set_mode(((welc['map']['width'])*20, (welc['map']['height'])*20))
water_tile_indices = [[random.randrange(len(water_images)) if tile == 2 else None for tile in row] for row in welc['map']['tiles']]
ex=False
smer='stay'
y = None
y_lock = threading.Lock()

def izris(frame):
    clover=frame['cloverState']
    entities=frame['entities']
    canvas.fill(canvas_color)
    #print(type(welc['map']))
    #print(welc['map'])
    for i in range(len(welc['map']['tiles'])):
        for j in range(len(welc['map']['tiles'][i])):
            if welc['map']['tiles'][i][j]==2:
                tile_index = water_tile_indices[i][j]
                canvas.blit(water_images[tile_index], (j*20, i*20, 20, 20))
                #pygame.draw.rect(canvas, (0, 0, 255), (j*20, i*20, 20, 20))
                #canvas.blit(myimage2, (j*20, i*20, 20, 20))
            elif welc['map']['tiles'][i][j]==0:
                #print('trava')
                #pygame.draw.rect(canvas, (0, 255, 0), (j*20, i*20, 20, 20))
                canvas.blit(myimage0, (j*20, i*20, 20, 20))
            elif welc['map']['tiles'][i][j]==3:
                #pygame.draw.rect(canvas, (255, 0, 0), (j*20, i*20, 20, 20))
                canvas.blit(myimage3, (j*20, i*20, 20, 20))
            elif welc['map']['tiles'][i][j]==1:
                #pygame.draw.rect(canvas, (0, 255, 255), (j*20, i*20, 20, 20))
                canvas.blit(myimage1, (j*20, i*20, 20, 20))
            elif welc['map']['tiles'][i][j]==4:
                #print('trava')
                #pygame.draw.rect(canvas, (0, 255, 0), (j*20, i*20, 20, 20))
                canvas.blit(myimage4, (j*20, i*20, 20, 20))
            elif welc['map']['tiles'][i][j]==5:
                #pygame.draw.rect(canvas, (0, 255, 255), (j*20, i*20, 20, 20))
                canvas.blit(myimage5, (j*20, i*20, 20, 20))
            elif welc['map']['tiles'][i][j]==6:
                #pygame.draw.rect(canvas, (0, 255, 255), (j*20, i*20, 20, 20))
                canvas.blit(myimage6, (j*20, i*20, 20, 20))
    for i in range(len(clover)):
        j=clover[i]
        if j['available']==True:
            pygame.draw.rect(canvas, (255, 255, 0), ((j['x']*20)+7.5, (j['y']*20)+7.5, 5, 5))
    for i in range(len(entities)):
        j=entities[i]
        if j['kind']=='rabbit':
            pygame.draw.rect(canvas, (255, 255, 255), ((j['x']*20)+5, (j['y']*20)+5, 10, 10))
        elif j['kind']=='wolf':
            pygame.draw.rect(canvas, (0, 0, 0), ((j['x']*20)+5, (j['y']*20)+5, 10, 10))
        #textSufaceObj = font.render(j['displayName'], True, (99, 196, 201), None)
        #textRe = textSufaceObj.get_rect()
        #textRe.center = (j['x']*20 // 2, j['y']*20-20 // 2)
        t=font.render(j['displayName'],True,(47, 82, 84)); canvas.blit(t,t.get_rect(center=((j['x']*20)+5,((j['y']*20)+5)-20)))
        #canvas.blit(textSufaceObj,textRe, 20, 20)
    #t=font.render(welc['kind'],True,(47, 82, 84)); canvas.blit(t,t.get_rect(center=(15,7)))
    pygame.display.flip()

def send_data():
    global y
    global smer
    while True:
        try:
            #print('posiljam')
            msg = ws.recv()
            print('received:', msg)
            parsed = json.loads(msg)
            tick = parsed.get('tick')
            if tick is None:
                #print('Skipping message without tick:', parsed)
                continue
            with y_lock:
                y = parsed
            decision = '{"type":"decision","tick":'+str(tick)+',"moves":["'+smer+'"]}'
            #print(decision)
            ws.send(decision)
            smer='stay'
        except json.JSONDecodeError as e:
            print('Invalid JSON received:', e)
            continue
        except Exception as e:
            print(f"Error: {e}")
            break



thread = threading.Thread(target=send_data, daemon=True).start()
while not ex:
    #print('dela')
    with y_lock:
        current_frame = y
    if current_frame is not None:
        izris(current_frame)
    
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            ex = True
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT:
                smer='moveLeft'
                print('levo')
            elif event.key == pygame.K_RIGHT:
                smer='moveRight'
                print('desno')
            elif event.key == pygame.K_UP:
                smer='moveUp'
                print('got')
            elif event.key == pygame.K_DOWN:
                smer='moveDown'
                print('dol')
    time.sleep(0.1)
