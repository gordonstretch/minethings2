Bidding on <? echo $html->link($item['Item']['name'], '/items/view/'.$item['Item']['id']); ?>
<? 
echo $form->create('Bid', array('action' => 'add/'.$item['Item']['id'])); 
echo $form->input( 'price' );
echo $form->end();
?>
