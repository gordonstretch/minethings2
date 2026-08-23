<?

echo $form->create(null, array('url' => '/admins/give_item/'));
echo $form->input('ItemsMiner.item_id', array('type' => 'text'));
echo $form->input('ItemsMiner.miner_id', array('type' => 'text'));
echo $form->input('ItemsMiner.city_id', array('type' => 'text'));
echo $form->input('ItemsMiner.quantity', array('type' => 'text'));
echo $form->end('Give');
if (isset($message))
	echo $message;

?>