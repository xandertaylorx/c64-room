10 rem *** lunar lander ***
20 s=54272:poke 53280,0:poke 53281,0:dim g(39):hi=0
30 for i=0 to 24:poke s+i,0:next:poke s+24,15:poke s+1,10:poke s+5,0:poke s+6,240
40 print "{147}{158}":print:print:print "     L U N A R   L A N D E R"
50 print:print "{5}   W OR SPACE FIRES THE MAIN ENGINE"
60 print "   A / D FIRES THE SIDE THRUSTERS"
70 print "   LAND SOFTLY ON THE GREEN PAD."
80 print:print "{159}   HIGH SCORE:";hi
90 print:print "{158}   PRESS ANY KEY"
100 get k$:if k$="" then 100
110 lv=1:sc=0
120 gosub 800
130 tt=ti+3
140 get k$:j=peek(56320):kk=peek(197):th=0
150 if (kk=9 or kk=60 or (j and 1)=0 or (j and 16)=0) and fu>0 then th=1
160 vy=vy+gv
170 if th=1 then vy=vy-.14:fu=fu-1:poke s+4,129
180 if th=0 then poke s+4,128
190 if (kk=10 or (j and 4)=0) and fu>0 then vx=vx-.05:fu=fu-1
200 if (kk=18 or (j and 8)=0) and fu>0 then vx=vx+.05:fu=fu-1
210 poke 1024+oy*40+ox,32:poke 1024+(oy+1)*40+ox,32
220 px=px+vx:py=py+vy
230 if px<0 then px=0:vx=0
240 if px>39 then px=39:vx=0
250 if py<1 then py=1:vy=0
260 ox=int(px):oy=int(py)
270 if oy+1>=g(ox) then 400
280 poke 1024+oy*40+ox,1:poke 55296+oy*40+ox,1
290 if th=1 then poke 1024+(oy+1)*40+ox,42:poke 55296+(oy+1)*40+ox,7
300 al=g(ox)-oy-1
310 print "{19}{5} FUEL";fu;" ALT";al;" DOWN";int(vy*10);" SIDE";int(vx*10);"  "
320 if ti<tt then 320
330 goto 130
400 poke s+4,128:oy=g(ox)-1:poke 1024+oy*40+ox,32
410 if ox>=pd and ox<pd+pw and abs(vx)<.5 and vy<1.1 then 500
420 rem crash
430 poke s+1,5:poke s+4,129:poke 53280,2:poke 1024+oy*40+ox,42:poke 55296+oy*40+ox,2
440 poke 781,10:poke 782,12:poke 783,0:sys 65520:print "{18}{28} CRASHED! {146}"
450 gosub 900
460 poke s+4,128:poke s+1,10:poke 53280,0
470 if sc>hi then hi=sc
480 print "{147}":goto 40
500 rem landed
510 b=100*lv+fu:sc=sc+b:poke s+4,128
520 poke 781,10:poke 782,10:poke 783,0:sys 65520:print "{18}{153} PERFECT LANDING! {146}"
530 poke 781,12:poke 782,13:poke 783,0:sys 65520:print "{5}BONUS";b
540 gosub 900:lv=lv+1:gosub 800:goto 130
800 print "{147}":pw=7-lv:if pw<3 then pw=3
810 pd=int(rnd(1)*(34-pw))+2
820 for c=0 to 39:g(c)=22:if rnd(1)<.28 then g(c)=21
830 next:for c=pd to pd+pw-1:g(c)=22:next
840 for c=0 to 39:for r=g(c) to 24:poke 1024+r*40+c,160:poke 55296+r*40+c,12:next:next
850 for c=pd to pd+pw-1:poke 55296+22*40+c,5:next
860 px=int(rnd(1)*30)+5:py=2:vx=(rnd(1)-.5)*.6:vy=0:fu=260+lv*20:gv=.03+lv*.008
870 ox=int(px):oy=py:return
900 tt=ti+100
910 if ti<tt then 910
920 get k$:if k$<>"" then 920
930 poke 781,22:poke 782,10:poke 783,0:sys 65520:print "{5}PRESS A KEY"
940 get k$:if k$="" then 940
950 return
