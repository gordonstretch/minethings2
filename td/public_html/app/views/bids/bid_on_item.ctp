Bidding on <? echo $item['Item']['name']; ?>
<? 
echo $form->create(); 
echo $form->hidden('item_id', array('value' => $item['Item']['id']) );
echo $form->input( 'price' );
echo $form->end();
?>
