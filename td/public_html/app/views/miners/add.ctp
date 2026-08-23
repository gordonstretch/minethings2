<h3>Add Miner</h3>
<?
echo $message;

echo $form->create();

echo $form->input('name');

$options = array();
foreach($cities as $c)
	$options[$c['id']] = $c['name'];
echo $form->input('city_id', array('options' => $options));

$options = array();
foreach($mineTypes as $m)
	$options[$m['id']] = $m['name'];
echo $form->input('mine_type_id', array('options' => $options));

echo $form->end("add");
?>