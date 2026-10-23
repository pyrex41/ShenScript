\\ Representative one-dimensional heat diffusion, fixed boundaries.
\\ Returns the complete final state; ordinary Shen numbers and vectors.
(define aot.heat-init
  I N V -> V where (> I N)
  I N V -> (do (vector-> V I (if (= I 1) 100 0))
                (aot.heat-init (+ I 1) N V)))
(define aot.heat-step
  I N Source Target -> Target where (>= I N)
  I N Source Target -> (do
    (vector-> Target I
      (+ (<-vector Source I)
         (* 0.125 (+ (- (<-vector Source (- I 1)) (* 2 (<-vector Source I)))
                       (<-vector Source (+ I 1))))))
    (aot.heat-step (+ I 1) N Source Target)))
(define aot.heat-run
  0 N Source Target -> Source
  Steps N Source Target -> (do
    (aot.heat-step 2 N Source Target)
    (aot.heat-run (- Steps 1) N Target Source)))
(define aot.heat-list
  I N V -> [] where (> I N)
  I N V -> [(<-vector V I) | (aot.heat-list (+ I 1) N V)])
(define aot.heat
  Steps -> (let N 32
                Source (aot.heat-init 1 N (vector N))
                Target (aot.heat-init 1 N (vector N))
                Result (aot.heat-run Steps N Source Target)
             (aot.heat-list 1 N Result)))
