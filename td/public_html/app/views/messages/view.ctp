<div id="fullcenter">
<span style="float:right"><? echo $message['Message']['created']; ?></span>

<h3><? echo $message['Message']['subject']; ?> </h3><br>
<? 

$body = $message['Message']['body'];

// translate [rrl] tags into links
$body = preg_replace('/(?U)\[rrl=([^\]]*)\](.*)\[\/rrl\]/', $html->link('$2', '/$1'), $body);

$body = $market->commatizeGoldTags($body);

// replace newlines with <br>
$body = preg_replace('/\n/', '<br>', $body);

echo $body;
?>

</div>
